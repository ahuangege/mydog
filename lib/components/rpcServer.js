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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.start = void 0;
const tcpServer_1 = __importDefault(require("../components/tcpServer"));
const define = __importStar(require("../util/define"));
const rpcService = __importStar(require("./rpcService"));
let serverToken = "";
let maxLen = 0;
function start(app, cb) {
    let rpcConfig = app.someconfig.rpc || {};
    maxLen = rpcConfig.maxLen || define.some_config.SocketBufferMaxLen;
    let noDelay = rpcConfig.noDelay === false ? false : true;
    tcpServer_1.default(app.serverInfo.port, noDelay, startCb, newClientCb);
    function startCb() {
        let str = `listening at [${app.serverInfo.host}:${app.serverInfo.port}]  ${app.serverId}`;
        console.log(str);
        app.logger("info" /* info */, str);
        cb();
    }
    function newClientCb(socket) {
        new RpcServerSocket(app, socket);
    }
    let tokenConfig = app.someconfig.recognizeToken || {};
    serverToken = tokenConfig.serverToken || define.some_config.Server_Token;
}
exports.start = start;
class RpcServerSocket {
    constructor(app, socket) {
        this.id = "";
        this.registered = false;
        this.registerTimer = null;
        this.heartbeatTimer = null;
        this.sendCache = false;
        this.sendArr = [];
        this.sendTimer = null;
        this.app = app;
        this.socket = socket;
        socket.once("data", this.onRegisterData.bind(this));
        socket.on("close", this.onClose.bind(this));
        this.registerTimer = setTimeout(function () {
            app.logger("error" /* error */, `rpcServer -> register timeout, close the rpc socket: ${socket.remoteAddress}`);
            socket.close();
        }, 5000);
    }
    // 首条消息是注册
    onRegisterData(data) {
        try {
            let type = data.readUInt8(0);
            if (type === 1 /* register */) {
                this.registerHandle(data);
            }
            else {
                this.app.logger("error" /* error */, `rpcServer -> illegal rpc register, close the rpc socket: ${this.socket.remoteAddress}`);
                this.socket.close();
            }
        }
        catch (e) {
            this.socket.close();
            this.app.logger("error" /* error */, e.stack);
        }
    }
    /**
     * socket收到数据了
     * @param data
     */
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
            else if (type === 2 /* heartbeat */) {
                this.heartbeatHandle();
                this.heartbeatResponse();
            }
            else {
                this.app.logger("error" /* error */, `rpcServer -> illegal data type, close rpc client named: ${this.id}`);
                this.socket.close();
            }
        }
        catch (e) {
            this.app.logger("error" /* error */, e.stack);
        }
    }
    /**
     * socket连接关闭了
     */
    onClose() {
        clearTimeout(this.registerTimer);
        clearTimeout(this.heartbeatTimer);
        clearInterval(this.sendTimer);
        this.sendArr = [];
        if (this.registered) {
            this.app.rpcPool.removeSocket(this.id);
        }
        this.app.logger("error" /* error */, `rpcServer -> a rpc client disconnected: ${this.id}, ${this.socket.remoteAddress}`);
    }
    /**
     * 注册
     */
    registerHandle(msg) {
        clearTimeout(this.registerTimer);
        let data;
        try {
            data = JSON.parse(msg.slice(1).toString());
        }
        catch (err) {
            this.app.logger("error" /* error */, `rpcServer -> JSON parse error，close the rpc socket: ${this.socket.remoteAddress}`);
            this.socket.close();
            return;
        }
        if (data.serverToken !== serverToken) {
            this.app.logger("error" /* error */, `rpcServer -> illegal serverToken, close the rpc socket: ${this.socket.remoteAddress}`);
            this.socket.close();
            return;
        }
        if (this.app.rpcPool.hasSocket(data.id)) {
            this.app.logger("error" /* error */, `rpcServer -> already has a rpc client named: ${data.id}, close it, ${this.socket.remoteAddress}`);
            this.socket.close();
            return;
        }
        if (this.app.serverId <= data.id) {
            this.socket.close();
            return;
        }
        this.registered = true;
        this.socket.maxLen = maxLen;
        this.socket.on("data", this.onData.bind(this));
        this.id = data.id;
        this.app.rpcPool.addSocket(this.id, this);
        this.app.logger("info" /* info */, `rpcServer -> get new rpc client named: ${this.id}`);
        // 判断是否定时发送消息
        let rpcConfig = this.app.someconfig.rpc || {};
        let interval = 0;
        if (rpcConfig.interval) {
            if (typeof rpcConfig.interval === "number") {
                interval = rpcConfig.interval;
            }
            else {
                interval = rpcConfig.interval[data.serverType] || rpcConfig.interval.default || 0;
            }
        }
        if (interval >= 10) {
            this.sendCache = true;
            this.sendTimer = setInterval(this.sendInterval.bind(this), interval);
        }
        // 注册成功，回应
        let buffer = Buffer.allocUnsafe(5);
        buffer.writeUInt32BE(1, 0);
        buffer.writeUInt8(1 /* register */, 4);
        this.socket.send(buffer);
        this.heartbeatHandle();
    }
    /**
     * 心跳
     */
    heartbeatHandle() {
        let self = this;
        clearTimeout(this.heartbeatTimer);
        let rpcConfig = this.app.someconfig.rpc || {};
        let heartbeat = rpcConfig.heartbeat || define.some_config.Time.Rpc_Heart_Beat_Time;
        if (heartbeat < 5) {
            heartbeat = 5;
        }
        this.heartbeatTimer = setTimeout(function () {
            self.app.logger("warn" /* warn */, `rpcServer -> heartBeat time out, close it: ${self.id}`);
            self.socket.close();
        }, heartbeat * 1000 * 2);
    }
    /**
     * 心跳回应
     */
    heartbeatResponse() {
        let buffer = Buffer.allocUnsafe(5);
        buffer.writeUInt32BE(1, 0);
        buffer.writeUInt8(2 /* heartbeat */, 4);
        this.socket.send(buffer);
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
