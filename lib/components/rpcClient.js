"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
var interfaceDefine_1 = require("../util/interfaceDefine");
var tcpClient_1 = require("../components/tcpClient");
var define = __importStar(require("../util/define"));
var rpcService = __importStar(require("./rpcService"));
var appUtil_1 = require("../util/appUtil");
/**
 * 是否建立socket连接
 */
function ifCreateRpcClient(app, server) {
    // 两个服务器之间，只建立一个socket连接
    if (app.serverId < server.id) {
        removeSocket(server.id);
        new RpcClientSocket(app, server);
    }
}
exports.ifCreateRpcClient = ifCreateRpcClient;
/**
 * 移除socket连接
 */
function removeSocket(id) {
    var socket = rpcClientSockets[id];
    if (socket) {
        socket.remove();
        delete rpcClientSockets[id];
    }
}
exports.removeSocket = removeSocket;
var rpcClientSockets = {};
var RpcClientSocket = /** @class */ (function () {
    function RpcClientSocket(app, server) {
        this.socket = null;
        this.connectTimer = null;
        this.heartbeatTimer = null;
        this.heartbeatTimeoutTimer = null;
        this.die = false;
        this.app = app;
        this.id = server.id;
        this.host = server.host;
        this.port = server.port;
        rpcClientSockets[this.id] = this;
        this.doConnect(0);
    }
    RpcClientSocket.prototype.doConnect = function (delay) {
        if (this.die) {
            return;
        }
        var self = this;
        this.connectTimer = setTimeout(function () {
            var connectCb = function () {
                self.app.logger(interfaceDefine_1.loggerType.info, appUtil_1.concatStr("connect to rpc server ", self.id, " success"));
                // 注册
                var registerBuf = Buffer.from(JSON.stringify({
                    "id": self.app.serverId,
                    "serverToken": self.app.serverToken
                }));
                var buf = Buffer.allocUnsafe(registerBuf.length + 5);
                buf.writeUInt32BE(registerBuf.length + 1, 0);
                buf.writeUInt8(1 /* register */, 4);
                registerBuf.copy(buf, 5);
                self.socket.send(buf);
            };
            self.connectTimer = null;
            self.socket = new tcpClient_1.TcpClient(self.port, self.host, self.app.rpcConfig.maxLen || define.some_config.SocketBufferMaxLen, connectCb);
            self.socket.on("data", self.onData.bind(self));
            self.socket.on("close", self.onClose.bind(self));
            self.app.logger(interfaceDefine_1.loggerType.info, appUtil_1.concatStr("try to connect to rpc server ", self.id));
        }, delay);
    };
    RpcClientSocket.prototype.onClose = function () {
        this.app.rpcPool.removeSocket(this.id);
        clearTimeout(this.heartbeatTimer);
        clearTimeout(this.heartbeatTimeoutTimer);
        this.heartbeatTimeoutTimer = null;
        this.socket = null;
        this.app.logger(interfaceDefine_1.loggerType.error, appUtil_1.concatStr("socket closed, reconnect the rpc server ", this.id, " later"));
        this.doConnect(define.some_config.Time.Rpc_Reconnect_Time * 1000);
    };
    /**
     * 每隔一定时间发送心跳
     */
    RpcClientSocket.prototype.heartbeatSend = function () {
        var self = this;
        var timeDelay = define.some_config.Time.Rpc_Heart_Beat_Time * 1000 - 5000 + Math.floor(5000 * Math.random());
        this.heartbeatTimer = setTimeout(function () {
            var buf = Buffer.allocUnsafe(5);
            buf.writeUInt32BE(1, 0);
            buf.writeUInt8(2 /* heartbeat */, 4);
            self.socket.send(buf);
            self.heartbeatTimeoutStart();
            self.heartbeatSend();
        }, timeDelay);
    };
    /**
     * 发送心跳后，收到回应
     */
    RpcClientSocket.prototype.heartbeatResponse = function () {
        clearTimeout(this.heartbeatTimeoutTimer);
        this.heartbeatTimeoutTimer = null;
    };
    /**
     * 发送心跳后，一定时间内必须收到回应，否则断开连接
     */
    RpcClientSocket.prototype.heartbeatTimeoutStart = function () {
        if (this.heartbeatTimeoutTimer !== null) {
            return;
        }
        var self = this;
        this.heartbeatTimeoutTimer = setTimeout(function () {
            self.app.logger(interfaceDefine_1.loggerType.error, appUtil_1.concatStr("heartbeat timeout, close the rpc socket " + self.id));
            self.socket.close();
        }, define.some_config.Time.Rpc_Heart_Beat_Timeout_Time * 1000);
    };
    RpcClientSocket.prototype.onData = function (data) {
        try {
            var type = data.readUInt8(0);
            if (type === 4 /* clientMsgIn */) {
                this.app.backendServer.handleMsg(this.id, data);
            }
            else if (type === 5 /* clientMsgOut */) {
                this.app.frontendServer.sendMsgByUids(data);
            }
            else if (type === 6 /* rpcMsg */) {
                rpcService.handleMsg(this.id, data);
            }
            else if (type === 3 /* applySession */) {
                this.app.frontendServer.applySession(data);
            }
            else if (type === 1 /* register */) {
                this.registerHandle();
            }
            else if (type === 2 /* heartbeat */) {
                this.heartbeatResponse();
            }
        }
        catch (e) {
            this.app.logger(interfaceDefine_1.loggerType.error, e.stack);
        }
    };
    /**
     * 注册成功
     */
    RpcClientSocket.prototype.registerHandle = function () {
        this.heartbeatSend();
        this.app.rpcPool.addSocket(this.id, this.socket);
    };
    /**
     * 移除该socket
     */
    RpcClientSocket.prototype.remove = function () {
        this.die = true;
        if (this.socket) {
            this.socket.close();
        }
        else if (this.connectTimer !== null) {
            clearTimeout(this.connectTimer);
        }
    };
    return RpcClientSocket;
}());
exports.RpcClientSocket = RpcClientSocket;
