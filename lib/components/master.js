"use strict";
/**
 * master中心服务器，接受monitor连接，负责各服务器之间的互相认识，并接受cli命令
 */
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
exports.Master_ClientProxy = exports.Master_ServerProxy = exports.start = void 0;
const cliUtil_1 = require("./cliUtil");
const tcpServer_1 = __importDefault(require("./tcpServer"));
const starter_1 = require("../util/starter");
const define = require("../util/define");
const msgCoder = __importStar(require("./msgCoder"));
let servers = {};
let serversDataTmp = { "T": 1 /* addServer */, "servers": {} };
let masterCli;
let app;
function start(_app, cb) {
    app = _app;
    masterCli = new cliUtil_1.MasterCli(_app, servers);
    startServer(cb);
}
exports.start = start;
function startServer(cb) {
    tcpServer_1.default(app.serverInfo.port, true, startCb, newClientCb);
    function startCb() {
        let str = `listening at [${app.serverInfo.host}:${app.serverInfo.port}]  ${app.serverId}`;
        console.log(str);
        app.logger("info" /* info */, str);
        cb && cb();
        if (app.startMode === "all") {
            starter_1.runServers(app);
        }
    }
    function newClientCb(socket) {
        new UnregSocket_proxy(socket);
    }
}
/**
 * 尚未注册的socket代理
 */
class UnregSocket_proxy {
    constructor(socket) {
        this.registerTimer = null;
        this.socket = socket;
        this.onDataFunc = this.onData.bind(this);
        this.onCloseFunc = this.onClose.bind(this);
        socket.on("data", this.onDataFunc);
        socket.on("close", this.onCloseFunc);
        this.registerTimeout();
    }
    registerTimeout() {
        let self = this;
        this.registerTimer = setTimeout(function () {
            app.logger("error" /* error */, `master -> register timeout, close it, ${self.socket.remoteAddress}`);
            self.socket.close();
        }, 5000);
    }
    onData(_data) {
        let socket = this.socket;
        let data;
        try {
            data = JSON.parse(_data.toString());
        }
        catch (err) {
            app.logger("error" /* error */, `master -> unregistered socket, JSON parse error, close it, ${socket.remoteAddress}`);
            socket.close();
            return;
        }
        // 第一个数据包必须是注册
        if (!data || data.T !== 1 /* register */) {
            app.logger("error" /* error */, `master -> unregistered socket, illegal data, close it, ${socket.remoteAddress}`);
            socket.close();
            return;
        }
        // 是服务器？
        if (data.serverToken) {
            let tokenConfig = app.someconfig.recognizeToken || {};
            let serverToken = tokenConfig.serverToken || define.some_config.Server_Token;
            if (data.serverToken !== serverToken) {
                app.logger("error" /* error */, `master -> illegal serverToken, close it, ${socket.remoteAddress}`);
                socket.close();
                return;
            }
            if (!data.serverInfo || !data.serverInfo.id || !data.serverInfo.host || !data.serverInfo.port || !data.serverInfo.serverType) {
                app.logger("error" /* error */, `master -> illegal serverInfo, close it, ${socket.remoteAddress}`);
                socket.close();
                return;
            }
            this.registerOk();
            new Master_ServerProxy(data, socket);
            return;
        }
        // 是cli？
        if (data.cliToken) {
            let tokenConfig = app.someconfig.recognizeToken || {};
            let cliToken = tokenConfig.cliToken || define.some_config.Cli_Token;
            if (data.cliToken !== cliToken) {
                app.logger("error" /* error */, `master -> illegal cliToken, close it, ${socket.remoteAddress}`);
                socket.close();
                return;
            }
            this.registerOk();
            new Master_ClientProxy(socket);
            return;
        }
        app.logger("error" /* error */, `master -> illegal socket, close it, ${socket.remoteAddress}`);
        socket.close();
    }
    onClose() {
        clearTimeout(this.registerTimer);
        app.logger("error" /* error */, `master -> unregistered socket closed, ${this.socket.remoteAddress}`);
    }
    registerOk() {
        clearTimeout(this.registerTimer);
        this.socket.removeListener("data", this.onDataFunc);
        this.socket.removeListener("close", this.onCloseFunc);
        this.socket = null;
    }
}
/**
 * master处理服务器代理
 */
class Master_ServerProxy {
    constructor(data, socket) {
        this.sid = "";
        this.serverType = "";
        this.heartbeatTimeoutTimer = null;
        this.socket = socket;
        this.init(data);
    }
    init(data) {
        let socket = this.socket;
        if (!!servers[data.serverInfo.id]) {
            app.logger("error" /* error */, `master -> already has a monitor named: ${data.serverInfo.id}, close it, ${socket.remoteAddress}`);
            socket.close();
            return;
        }
        socket.maxLen = define.some_config.SocketBufferMaxLen;
        this.heartbeatTimeout();
        socket.on('data', this.onData.bind(this));
        socket.on('close', this.onClose.bind(this));
        this.sid = data.serverInfo.id;
        this.serverType = data.serverInfo.serverType;
        // 构造新增服务器的消息
        let socketInfo = {
            "T": 1 /* addServer */,
            "servers": {}
        };
        socketInfo.servers[this.sid] = data.serverInfo;
        let socketInfoBuf = msgCoder.encodeInnerData(socketInfo);
        // 向其他服务器通知,有新的服务器
        for (let sid in servers) {
            servers[sid].socket.send(socketInfoBuf);
        }
        // 通知新加入的服务器，当前已经有哪些服务器了
        let result = msgCoder.encodeInnerData(serversDataTmp);
        this.socket.send(result);
        servers[this.sid] = this;
        serversDataTmp.servers[this.sid] = data.serverInfo;
        app.logger("info" /* info */, `master -> get a new monitor named: ${this.sid}, ${this.socket.remoteAddress}`);
    }
    heartbeatTimeout() {
        let self = this;
        clearTimeout(this.heartbeatTimeoutTimer);
        this.heartbeatTimeoutTimer = setTimeout(function () {
            app.logger("error" /* error */, `master -> heartbeat timeout, close the monitor named: ${self.sid}, ${self.socket.remoteAddress}`);
            self.socket.close();
        }, define.some_config.Time.Monitor_Heart_Beat_Time * 1000 * 2);
    }
    send(msg) {
        this.socket.send(msgCoder.encodeInnerData(msg));
    }
    heartbeatResponse() {
        let msg = { T: 4 /* heartbeatResponse */ };
        let buf = msgCoder.encodeInnerData(msg);
        this.socket.send(buf);
    }
    onData(_data) {
        let data;
        try {
            data = JSON.parse(_data.toString());
        }
        catch (err) {
            app.logger("error" /* error */, `master -> JSON parse error，close the monitor named: ${this.sid}, ${this.socket.remoteAddress}`);
            this.socket.close();
            return;
        }
        try {
            if (data.T === 2 /* heartbeat */) {
                this.heartbeatTimeout();
                this.heartbeatResponse();
            }
            else if (data.T === 3 /* cliMsg */) {
                masterCli.deal_monitor_msg(data);
            }
        }
        catch (err) {
            app.logger("error" /* error */, `master -> handle msg error, close it: ${this.sid}, ${this.socket.remoteAddress}\n${err.stack}`);
            this.socket.close();
        }
    }
    onClose() {
        clearTimeout(this.heartbeatTimeoutTimer);
        delete servers[this.sid];
        delete serversDataTmp.servers[this.sid];
        let serverInfo = {
            "T": 2 /* removeServer */,
            "id": this.sid,
            "serverType": this.serverType
        };
        let serverInfoBuf = msgCoder.encodeInnerData(serverInfo);
        for (let sid in servers) {
            servers[sid].socket.send(serverInfoBuf);
        }
        app.logger("error" /* error */, `master -> a monitor disconnected: ${this.sid}, ${this.socket.remoteAddress}`);
    }
}
exports.Master_ServerProxy = Master_ServerProxy;
/**
 * master处理cli代理
 */
class Master_ClientProxy {
    constructor(socket) {
        this.heartbeatTimer = null;
        this.socket = socket;
        this.init();
    }
    init() {
        let socket = this.socket;
        socket.maxLen = define.some_config.SocketBufferMaxLen;
        this.heartbeatTimeOut();
        socket.on('data', this.onData.bind(this));
        socket.on('close', this.onClose.bind(this));
        app.logger("info" /* info */, `master -> get a new cli: ${socket.remoteAddress}`);
    }
    heartbeatTimeOut() {
        let self = this;
        clearTimeout(this.heartbeatTimer);
        this.heartbeatTimer = setTimeout(function () {
            app.logger("error" /* error */, `master -> heartbeat timeout, close the cli: ${self.socket.remoteAddress}`);
            self.socket.close();
        }, define.some_config.Time.Monitor_Heart_Beat_Time * 1000 * 2);
    }
    onData(_data) {
        let data;
        try {
            data = JSON.parse(_data.toString());
        }
        catch (err) {
            app.logger("error" /* error */, `master -> JSON parse error，close the cli: ${this.socket.remoteAddress}`);
            this.socket.close();
            return;
        }
        try {
            if (data.T === 2 /* heartbeat */) {
                this.heartbeatTimeOut();
            }
            else if (data.T === 3 /* cliMsg */) {
                app.logger("info" /* info */, `master -> master get command from the cli: ${this.socket.remoteAddress} ==> ${JSON.stringify(data)}`);
                masterCli.deal_cli_msg(this, data);
            }
            else {
                app.logger("error" /* error */, `master -> the cli illegal data type close it: ${this.socket.remoteAddress}`);
                this.socket.close();
            }
        }
        catch (e) {
            app.logger("error" /* error */, `master -> cli handle msg err, close it: ${this.socket.remoteAddress}\n ${e.stack}`);
            this.socket.close();
        }
    }
    send(msg) {
        this.socket.send(msgCoder.encodeInnerData(msg));
    }
    onClose() {
        clearTimeout(this.heartbeatTimer);
        app.logger("info" /* info */, `master -> a cli disconnected: ${this.socket.remoteAddress}`);
    }
}
exports.Master_ClientProxy = Master_ClientProxy;
