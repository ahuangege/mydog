"use strict";
/**
 * rpc消息中转服务器
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var tcpServer_1 = __importDefault(require("./tcpServer"));
var interfaceDefine_1 = require("../util/interfaceDefine");
var define = require("../util/define");
var app;
var servers = {};
function start(_app, cb) {
    app = _app;
    tcpServer_1.default(app.port, startCb, newClientCb);
    function startCb() {
        var str = "server start: " + app.host + ":" + app.port + " / " + app.serverId;
        console.log(str);
        app.logger(interfaceDefine_1.loggerType.info, interfaceDefine_1.componentName.rpcServer, str);
        cb && cb();
    }
    function newClientCb(socket) {
        new rpc_server_proxy(socket);
    }
}
exports.start = start;
var rpc_server_proxy = /** @class */ (function () {
    function rpc_server_proxy(socket) {
        this.sid = "";
        this.heartbeat_timer = null;
        this.registered = false;
        this.socket = socket;
        socket.on("data", this.onData.bind(this));
        socket.on("close", this.onClose.bind(this));
        this.register_timer = setTimeout(function () {
            app.logger(interfaceDefine_1.loggerType.warn, interfaceDefine_1.componentName.rpcServer, "register time out, close it: " + socket.socket.remoteAddress);
            socket.close();
        }, 10000);
        this.heartBeat_handle();
    }
    /**
     * 发送消息
     * @param buf
     */
    rpc_server_proxy.prototype.send = function (buf) {
        this.socket.send(buf);
    };
    /**
     * socket收到数据了
     * @param data
     */
    rpc_server_proxy.prototype.onData = function (data) {
        var type = data.readUInt8(0);
        if (type === 3 /* msg */) {
            this.msg_handle(data);
        }
        else if (type === 1 /* register */) {
            this.register_handle(data);
        }
        else if (type === 2 /* heartbeat */) {
            this.heartBeat_handle();
            this.heartbeatResponse();
        }
        else {
            app.logger(interfaceDefine_1.loggerType.warn, interfaceDefine_1.componentName.rpcServer, "illegal data, close rpc client named " + this.sid);
            this.socket.close();
        }
    };
    /**
     * socket连接关闭了
     */
    rpc_server_proxy.prototype.onClose = function () {
        clearTimeout(this.register_timer);
        clearTimeout(this.heartbeat_timer);
        if (this.registered) {
            delete servers[this.sid];
        }
    };
    /**
     * 注册
     * @param data
     */
    rpc_server_proxy.prototype.register_handle = function (_data) {
        var data;
        try {
            data = JSON.parse(_data.slice(1).toString());
        }
        catch (err) {
            app.logger(interfaceDefine_1.loggerType.warn, interfaceDefine_1.componentName.rpcServer, "register JSON parse error，close it:" + this.socket.socket.remoteAddress);
            this.socket.close();
            return;
        }
        if (data.serverToken !== app.serverToken) {
            app.logger(interfaceDefine_1.loggerType.warn, interfaceDefine_1.componentName.rpcServer, "illegal serverToken, close it: " + this.socket.socket.remoteAddress);
            this.socket.close();
            return;
        }
        if (!!servers[data.sid]) {
            app.logger(interfaceDefine_1.loggerType.warn, interfaceDefine_1.componentName.rpcServer, "already has a rpc client named " + data.sid + ", close it: " + this.socket.socket.remoteAddress);
            this.socket.close();
            return;
        }
        clearTimeout(this.register_timer);
        this.registered = true;
        this.sid = data.sid;
        servers[this.sid] = this;
        app.logger(interfaceDefine_1.loggerType.info, interfaceDefine_1.componentName.rpcServer, "get new rpc client named  " + this.sid);
    };
    /**
     * 心跳
     */
    rpc_server_proxy.prototype.heartBeat_handle = function () {
        var self = this;
        clearTimeout(this.heartbeat_timer);
        this.heartbeat_timer = setTimeout(function () {
            app.logger(interfaceDefine_1.loggerType.warn, interfaceDefine_1.componentName.rpcServer, " heartBeat time out : " + self.sid);
            self.socket.close();
        }, define.some_config.Time.Rpc_Heart_Beat_Time * 1000 * 2);
    };
    /**
     * 心跳回应
     */
    rpc_server_proxy.prototype.heartbeatResponse = function () {
        var buffer = Buffer.allocUnsafe(5);
        buffer.writeUInt32BE(1, 0);
        buffer.writeUInt8(2 /* heartbeatResponse */, 4);
        this.send(buffer);
    };
    /**
     * 中转rpc消息
     * @param msgBuf
     */
    rpc_server_proxy.prototype.msg_handle = function (msgBuf) {
        if (!this.registered) {
            return;
        }
        var iMsgLen = msgBuf.readUInt8(6);
        var iMsg = JSON.parse(msgBuf.slice(7, 7 + iMsgLen).toString());
        var server = servers[iMsg.to];
        if (server) {
            server.send(msgBuf.slice(1));
        }
        else if (iMsg.id && iMsg.from) {
            var iMsgBuf = Buffer.from(JSON.stringify({
                "id": iMsg.id
            }));
            var msgBuf2 = Buffer.from(JSON.stringify([3 /* rpc_has_no_end */]));
            var buffer = Buffer.allocUnsafe(6 + iMsgBuf.length + msgBuf2.length);
            buffer.writeUInt32BE(iMsgBuf.length + msgBuf2.length + 2, 0);
            buffer.writeUInt8(1 /* msg */, 4);
            buffer.writeUInt8(iMsgBuf.length, 5);
            iMsgBuf.copy(buffer, 6);
            msgBuf2.copy(buffer, 6 + iMsgBuf.length);
            this.send(buffer);
        }
    };
    rpc_server_proxy.prototype.close = function () {
        this.socket.close();
    };
    return rpc_server_proxy;
}());
