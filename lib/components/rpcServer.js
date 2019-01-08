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
var define_1 = __importDefault(require("../util/define"));
var app;
var servers = {};
function start(_app, cb) {
    app = _app;
    tcpServer_1.default(app.port, startCb, newClientCb);
    function startCb() {
        console.log("server start: " + app.host + ":" + app.port + " / " + app.serverId);
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
            app.logger(interfaceDefine_1.loggerType.warn, interfaceDefine_1.componentName.rpcServer, "register time out, close it");
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
        if (type === define_1.default.Rpc_Msg.msg) {
            this.msg_handle(data);
        }
        else if (type === define_1.default.Rpc_Msg.register) {
            this.register_handle(data);
        }
        else if (type === define_1.default.Rpc_Msg.heartbeat) {
            this.heartBeat_handle();
        }
        else {
            app.logger(interfaceDefine_1.loggerType.debug, interfaceDefine_1.componentName.rpcServer, "illegal data, close rpc client named " + this.sid);
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
            app.logger(interfaceDefine_1.loggerType.debug, interfaceDefine_1.componentName.rpcServer, "JSON parse error，close it");
            this.socket.close();
            return;
        }
        if (data.serverToken !== app.serverToken) {
            app.logger(interfaceDefine_1.loggerType.debug, interfaceDefine_1.componentName.rpcServer, "illegal token, it");
            this.socket.close();
            return;
        }
        if (!!servers[data.sid]) {
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
            app.logger(interfaceDefine_1.loggerType.debug, interfaceDefine_1.componentName.rpcServer, " heartBeat time out : " + self.sid);
            self.socket.close();
        }, define_1.default.Time.Rpc_Heart_Beat_Time * 1000 * 2);
    };
    /**
     * 中转rpc消息
     * @param msgBuf
     */
    rpc_server_proxy.prototype.msg_handle = function (msgBuf) {
        if (!this.registered) {
            return;
        }
        var iMsgLen = msgBuf.readUInt8(1);
        var data = JSON.parse(msgBuf.slice(2, 2 + iMsgLen).toString());
        var server = servers[data.to];
        var buffer;
        if (server) {
            buffer = Buffer.allocUnsafe(msgBuf.length + 3);
            buffer.writeUInt32BE(msgBuf.length - 1, 0);
            msgBuf.copy(buffer, 4, 1);
            server.send(buffer);
        }
        else if (data.id && data.from) {
            var iMsgBuf = Buffer.from(JSON.stringify({
                "id": data.id
            }));
            msgBuf = Buffer.from(JSON.stringify([3 /* rpc_has_no_end */]));
            buffer = Buffer.allocUnsafe(5 + iMsgBuf.length + msgBuf.length);
            buffer.writeUInt32BE(iMsgBuf.length + msgBuf.length + 1, 0);
            buffer.writeUInt8(iMsgBuf.length, 4);
            iMsgBuf.copy(buffer, 5);
            msgBuf.copy(buffer, 5 + iMsgBuf.length);
            this.send(buffer);
        }
    };
    rpc_server_proxy.prototype.close = function () {
        this.socket.close();
    };
    return rpc_server_proxy;
}());
