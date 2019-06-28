"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
var tcpServer_1 = __importDefault(require("../components/tcpServer"));
var interfaceDefine_1 = require("../util/interfaceDefine");
var define = __importStar(require("../util/define"));
var rpcService = __importStar(require("./rpcService"));
var appUtil_1 = require("../util/appUtil");
function start(app, cb) {
    tcpServer_1.default(app.port, app.rpcConfig.maxLen || define.some_config.SocketBufferMaxLen, startCb, newClientCb);
    function startCb() {
        var str = appUtil_1.concatStr("listening at [", app.host, ":", app.port, "]  ", app.serverId);
        console.log(str);
        app.logger(interfaceDefine_1.loggerType.info, str);
        cb();
    }
    function newClientCb(socket) {
        new RpcServerSocket(app, socket);
    }
}
exports.start = start;
var RpcServerSocket = /** @class */ (function () {
    function RpcServerSocket(app, socket) {
        this.id = "";
        this.registered = false;
        this.registerTimer = null;
        this.heartbeatTimer = null;
        this.app = app;
        this.socket = socket;
        socket.on("data", this.onData.bind(this));
        socket.on("close", this.onClose.bind(this));
        this.registerTimer = setTimeout(function () {
            app.logger(interfaceDefine_1.loggerType.error, appUtil_1.concatStr("register timeout, close rpc socket, ", socket.remoteAddress));
            socket.close();
        }, 10000);
    }
    /**
     * socket收到数据了
     * @param data
     */
    RpcServerSocket.prototype.onData = function (data) {
        try {
            var type = data.readUInt8(0);
            if (type === 4 /* clientMsgIn */) {
                if (!this.registered)
                    return this.socket.close();
                this.app.backendServer.handleMsg(this.id, data);
            }
            else if (type === 5 /* clientMsgOut */) {
                if (!this.registered)
                    return this.socket.close();
                this.app.frontendServer.sendMsgByUids(data);
            }
            else if (type === 6 /* rpcMsg */) {
                if (!this.registered)
                    return this.socket.close();
                rpcService.handleMsg(this.id, data);
            }
            else if (type === 3 /* applySession */) {
                if (!this.registered)
                    return this.socket.close();
                this.app.frontendServer.applySession(data);
            }
            else if (type === 1 /* register */) {
                this.registerHandle(data);
            }
            else if (type === 2 /* heartbeat */) {
                if (!this.registered)
                    return this.socket.close();
                this.heartbeatHandle();
                this.heartbeatResponse();
            }
            else {
                this.app.logger(interfaceDefine_1.loggerType.error, appUtil_1.concatStr("illegal data type, close rpc client named " + this.id));
                this.socket.close();
            }
        }
        catch (e) {
            this.app.logger(interfaceDefine_1.loggerType.error, e.stack);
        }
    };
    /**
     * socket连接关闭了
     */
    RpcServerSocket.prototype.onClose = function () {
        clearTimeout(this.registerTimer);
        clearTimeout(this.heartbeatTimer);
        if (this.registered) {
            this.app.rpcPool.removeSocket(this.id);
        }
        this.app.logger(interfaceDefine_1.loggerType.error, appUtil_1.concatStr("a rpc client disconnected, ", this.id, ", ", this.socket.remoteAddress));
    };
    /**
     * 注册
     */
    RpcServerSocket.prototype.registerHandle = function (msg) {
        clearTimeout(this.registerTimer);
        var data;
        try {
            data = JSON.parse(msg.slice(1).toString());
        }
        catch (err) {
            this.app.logger(interfaceDefine_1.loggerType.error, appUtil_1.concatStr("JSON parse error，close the rpc socket, ", this.socket.remoteAddress));
            this.socket.close();
            return;
        }
        if (data.serverToken !== this.app.serverToken) {
            this.app.logger(interfaceDefine_1.loggerType.error, appUtil_1.concatStr("illegal serverToken, close the rpc socket, ", this.socket.remoteAddress));
            this.socket.close();
            return;
        }
        if (this.app.rpcPool.hasSocket(data.id)) {
            this.app.logger(interfaceDefine_1.loggerType.error, appUtil_1.concatStr("already has a rpc client named ", data.id, ", close it, ", this.socket.remoteAddress));
            this.socket.close();
            return;
        }
        if (this.app.serverId <= data.id) {
            this.socket.close();
            return;
        }
        this.registered = true;
        this.id = data.id;
        this.app.rpcPool.addSocket(this.id, this.socket);
        this.app.logger(interfaceDefine_1.loggerType.info, appUtil_1.concatStr("get new rpc client named ", this.id));
        // 注册成功，回应
        var buffer = Buffer.allocUnsafe(5);
        buffer.writeUInt32BE(1, 0);
        buffer.writeUInt8(1 /* register */, 4);
        this.socket.send(buffer);
        this.heartbeatHandle();
    };
    /**
     * 心跳
     */
    RpcServerSocket.prototype.heartbeatHandle = function () {
        var self = this;
        clearTimeout(this.heartbeatTimer);
        this.heartbeatTimer = setTimeout(function () {
            self.app.logger(interfaceDefine_1.loggerType.warn, appUtil_1.concatStr("heartBeat time out, close it, " + self.id));
            self.socket.close();
        }, define.some_config.Time.Rpc_Heart_Beat_Time * 1000 * 2);
    };
    /**
     * 心跳回应
     */
    RpcServerSocket.prototype.heartbeatResponse = function () {
        var buffer = Buffer.allocUnsafe(5);
        buffer.writeUInt32BE(1, 0);
        buffer.writeUInt8(2 /* heartbeat */, 4);
        this.socket.send(buffer);
    };
    return RpcServerSocket;
}());
