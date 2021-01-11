"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RpcClientSocket = exports.removeSocket = exports.ifCreateRpcClient = void 0;
const tcpClient_1 = require("../components/tcpClient");
const define = __importStar(require("../util/define"));
const rpcService = __importStar(require("./rpcService"));
const appUtil = __importStar(require("../util/appUtil"));
/**
 * 是否建立socket连接
 */
function ifCreateRpcClient(app, server) {
    // 两个服务器之间，只建立一个socket连接
    if (app.serverId < server.id && !app.serverTypeSocketOffConfig[appUtil.getServerTypeSocketOffKey(app.serverType, server.serverType)]) {
        removeSocket(server.id);
        new RpcClientSocket(app, server);
    }
}
exports.ifCreateRpcClient = ifCreateRpcClient;
/**
 * 移除socket连接
 */
function removeSocket(id) {
    let socket = rpcClientSockets[id];
    if (socket) {
        socket.remove();
        delete rpcClientSockets[id];
    }
}
exports.removeSocket = removeSocket;
let rpcClientSockets = {};
class RpcClientSocket {
    constructor(app, server) {
        this.socket = null;
        this.connectTimer = null;
        this.heartbeatTimer = null;
        this.heartbeatTimeoutTimer = null;
        this.sendCache = false;
        this.interval = 0;
        this.sendArr = [];
        this.sendTimer = null;
        this.die = false;
        this.serverToken = "";
        this.app = app;
        this.id = server.id;
        this.host = server.host;
        this.port = server.port;
        rpcClientSockets[this.id] = this;
        let rpcConfig = app.someconfig.rpc || {};
        let interval = 0;
        if (rpcConfig.interval) {
            if (typeof rpcConfig.interval === "number") {
                interval = rpcConfig.interval;
            }
            else {
                interval = rpcConfig.interval[server.serverType] || rpcConfig.interval.default || 0;
            }
        }
        if (interval >= 10) {
            this.sendCache = true;
            this.interval = interval;
        }
        let tokenConfig = app.someconfig.recognizeToken || {};
        this.serverToken = tokenConfig.serverToken || define.some_config.Server_Token;
        this.doConnect(0);
    }
    doConnect(delay) {
        if (this.die) {
            return;
        }
        let self = this;
        this.connectTimer = setTimeout(() => {
            let connectCb = function () {
                self.app.logger("info" /* info */, `rpcClient -> connect to rpc server success: ${self.id}`);
                // 注册
                let registerBuf = Buffer.from(JSON.stringify({
                    "id": self.app.serverId,
                    "serverType": self.app.serverType,
                    "serverToken": self.serverToken
                }));
                let buf = Buffer.allocUnsafe(registerBuf.length + 5);
                buf.writeUInt32BE(registerBuf.length + 1, 0);
                buf.writeUInt8(1 /* register */, 4);
                registerBuf.copy(buf, 5);
                self.socket.send(buf);
                if (self.sendCache) {
                    self.sendTimer = setInterval(self.sendInterval.bind(self), self.interval);
                }
            };
            self.connectTimer = null;
            let rpcConfig = self.app.someconfig.rpc || {};
            let noDelay = rpcConfig.noDelay === false ? false : true;
            self.socket = new tcpClient_1.TcpClient(self.port, self.host, rpcConfig.maxLen || define.some_config.SocketBufferMaxLen, noDelay, connectCb);
            self.socket.on("data", self.onData.bind(self));
            self.socket.on("close", self.onClose.bind(self));
            self.app.logger("info" /* info */, `rpcClient -> try to connect to rpc server: ${self.id}`);
        }, delay);
    }
    onClose() {
        this.app.rpcPool.removeSocket(this.id);
        clearTimeout(this.heartbeatTimer);
        clearTimeout(this.heartbeatTimeoutTimer);
        clearInterval(this.sendTimer);
        this.sendArr = [];
        this.heartbeatTimeoutTimer = null;
        this.socket = null;
        this.app.logger("error" /* error */, `rpcClient -> socket closed, reconnect the rpc server later: ${this.id}`);
        let rpcConfig = this.app.someconfig.rpc || {};
        let delay = rpcConfig.reconnectDelay || define.some_config.Time.Rpc_Reconnect_Time;
        this.doConnect(delay * 1000);
    }
    /**
     * 每隔一定时间发送心跳
     */
    heartbeatSend() {
        let self = this;
        let rpcConfig = this.app.someconfig.rpc || {};
        let heartbeat = rpcConfig.heartbeat || define.some_config.Time.Rpc_Heart_Beat_Time;
        let timeDelay = heartbeat * 1000 - 5000 + Math.floor(5000 * Math.random());
        if (timeDelay < 5000) {
            timeDelay = 5000;
        }
        this.heartbeatTimer = setTimeout(function () {
            let buf = Buffer.allocUnsafe(5);
            buf.writeUInt32BE(1, 0);
            buf.writeUInt8(2 /* heartbeat */, 4);
            self.socket.send(buf);
            self.heartbeatTimeoutStart();
            self.heartbeatSend();
        }, timeDelay);
    }
    /**
     * 发送心跳后，收到回应
     */
    heartbeatResponse() {
        clearTimeout(this.heartbeatTimeoutTimer);
        this.heartbeatTimeoutTimer = null;
    }
    /**
     * 发送心跳后，一定时间内必须收到回应，否则断开连接
     */
    heartbeatTimeoutStart() {
        if (this.heartbeatTimeoutTimer !== null) {
            return;
        }
        let self = this;
        this.heartbeatTimeoutTimer = setTimeout(function () {
            self.app.logger("error" /* error */, `rpcClient -> heartbeat timeout, close the rpc socket: ${self.id}`);
            self.socket.close();
        }, define.some_config.Time.Rpc_Heart_Beat_Timeout_Time * 1000);
    }
    onData(data) {
        try {
            let type = data.readUInt8(0);
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
            this.app.logger("error" /* error */, e.stack);
        }
    }
    /**
     * 注册成功
     */
    registerHandle() {
        this.heartbeatSend();
        this.app.rpcPool.addSocket(this.id, this);
    }
    /**
     * 移除该socket
     */
    remove() {
        this.die = true;
        if (this.socket) {
            this.socket.close();
        }
        else if (this.connectTimer !== null) {
            clearTimeout(this.connectTimer);
        }
    }
    send(data) {
        if (this.sendCache) {
            this.sendArr.push(data);
        }
        else {
            this.socket.send(data);
        }
    }
    sendInterval() {
        if (this.sendArr.length > 0) {
            let arr = this.sendArr;
            let i;
            let len = arr.length;
            for (i = 0; i < len; i++) {
                this.socket.send(arr[i]);
            }
            this.sendArr = [];
        }
    }
}
exports.RpcClientSocket = RpcClientSocket;
