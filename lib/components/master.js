"use strict";
/**
 * master中心服务器，接受monitor连接，负责各服务器之间的互相认识，并接受cli命令
 */
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
var cliUtil_1 = require("./cliUtil");
var interfaceDefine_1 = require("../util/interfaceDefine");
var tcpServer_1 = __importDefault(require("./tcpServer"));
var starter_1 = require("../util/starter");
var define = require("../util/define");
var msgCoder = __importStar(require("./msgCoder"));
var appUtil_1 = require("../util/appUtil");
var servers = {};
var serversDataTmp = { "T": 1 /* addServer */, "serverInfoIdMap": {} };
var masterCli;
var app;
function start(_app, cb) {
    app = _app;
    masterCli = new cliUtil_1.MasterCli(_app, servers);
    startServer(cb);
}
exports.start = start;
function startServer(cb) {
    tcpServer_1.default(app.port, define.some_config.SocketBufferMaxLen, startCb, newClientCb);
    function startCb() {
        var str = appUtil_1.concatStr("listening at [", app.host, ":", app.port, "]  ", app.serverId);
        console.log(str);
        app.logger(interfaceDefine_1.loggerType.info, str);
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
var UnregSocket_proxy = /** @class */ (function () {
    function UnregSocket_proxy(socket) {
        this.registerTimer = null;
        this.socket = socket;
        this.onDataFunc = this.onData.bind(this);
        this.onCloseFunc = this.onClose.bind(this);
        socket.on("data", this.onDataFunc);
        socket.on("close", this.onCloseFunc);
        this.registerTimeout();
    }
    UnregSocket_proxy.prototype.registerTimeout = function () {
        var self = this;
        this.registerTimer = setTimeout(function () {
            app.logger(interfaceDefine_1.loggerType.error, appUtil_1.concatStr("register timeout, close it, " + self.socket.remoteAddress));
            self.socket.close();
        }, 10000);
    };
    UnregSocket_proxy.prototype.onData = function (_data) {
        var socket = this.socket;
        var data;
        try {
            data = JSON.parse(_data.toString());
        }
        catch (err) {
            app.logger(interfaceDefine_1.loggerType.error, appUtil_1.concatStr("unregistered socket, JSON parse error, close it, ", socket.remoteAddress));
            socket.close();
            return;
        }
        // 第一个数据包必须是注册
        if (!data || data.T !== 1 /* register */) {
            app.logger(interfaceDefine_1.loggerType.error, appUtil_1.concatStr("unregistered socket, illegal data, close it, ", socket.remoteAddress));
            socket.close();
            return;
        }
        // 是服务器？
        if (data.serverToken) {
            if (data.serverToken !== app.serverToken) {
                app.logger(interfaceDefine_1.loggerType.error, appUtil_1.concatStr("illegal serverToken, close it, ", socket.remoteAddress));
                socket.close();
                return;
            }
            if (!data.serverType || !data.serverInfo || !data.serverInfo.id || !data.serverInfo.host || !data.serverInfo.port) {
                app.logger(interfaceDefine_1.loggerType.error, appUtil_1.concatStr("illegal serverInfo, close it, ", socket.remoteAddress));
                socket.close();
                return;
            }
            this.registerOk();
            new Master_ServerProxy(data, socket);
            return;
        }
        // 是cli？
        if (data.cliToken) {
            if (data.cliToken !== app.cliToken) {
                app.logger(interfaceDefine_1.loggerType.error, appUtil_1.concatStr("illegal cliToken, close it, ", socket.remoteAddress));
                socket.close();
                return;
            }
            this.registerOk();
            new Master_ClientProxy(socket);
            return;
        }
        app.logger(interfaceDefine_1.loggerType.error, appUtil_1.concatStr("illegal socket, close it, " + socket.remoteAddress));
        socket.close();
    };
    UnregSocket_proxy.prototype.onClose = function () {
        clearTimeout(this.registerTimer);
        app.logger(interfaceDefine_1.loggerType.error, appUtil_1.concatStr("unregistered socket closed, ", this.socket.remoteAddress));
    };
    UnregSocket_proxy.prototype.registerOk = function () {
        clearTimeout(this.registerTimer);
        this.socket.removeListener("data", this.onDataFunc);
        this.socket.removeListener("close", this.onCloseFunc);
        this.socket = null;
    };
    return UnregSocket_proxy;
}());
/**
 * master处理服务器代理
 */
var Master_ServerProxy = /** @class */ (function () {
    function Master_ServerProxy(data, socket) {
        this.sid = "";
        this.serverType = "";
        this.heartbeatTimeoutTimer = null;
        this.socket = socket;
        this.init(data);
    }
    Master_ServerProxy.prototype.init = function (data) {
        var socket = this.socket;
        if (!!servers[data.serverInfo.id]) {
            app.logger(interfaceDefine_1.loggerType.error, appUtil_1.concatStr("already has a monitor named ", data.serverInfo.id, ", close it, ", socket.remoteAddress));
            socket.close();
            return;
        }
        this.heartbeatTimeout();
        socket.on('data', this.onData.bind(this));
        socket.on('close', this.onClose.bind(this));
        this.sid = data.serverInfo.id;
        this.serverType = data.serverType;
        // 构造新增服务器的消息
        var socketInfo = {
            "T": 1 /* addServer */,
            "serverInfoIdMap": {}
        };
        socketInfo.serverInfoIdMap[this.sid] = {
            "serverType": data.serverType,
            "serverInfo": data.serverInfo
        };
        var socketInfoBuf = msgCoder.encodeInnerData(socketInfo);
        // 向其他服务器通知,有新的服务器
        for (var sid in servers) {
            servers[sid].socket.send(socketInfoBuf);
        }
        // 通知新加入的服务器，当前已经有哪些服务器了
        var result = msgCoder.encodeInnerData(serversDataTmp);
        this.socket.send(result);
        servers[this.sid] = this;
        serversDataTmp.serverInfoIdMap[this.sid] = {
            "serverType": data.serverType,
            "serverInfo": data.serverInfo
        };
        app.logger(interfaceDefine_1.loggerType.info, appUtil_1.concatStr("get a new monitor named ", this.sid, ", ", this.socket.remoteAddress));
    };
    Master_ServerProxy.prototype.heartbeatTimeout = function () {
        var self = this;
        clearTimeout(this.heartbeatTimeoutTimer);
        this.heartbeatTimeoutTimer = setTimeout(function () {
            app.logger(interfaceDefine_1.loggerType.error, appUtil_1.concatStr("heartbeat timeout, close the monitor named ", self.sid, ", " + self.socket.remoteAddress));
            self.socket.close();
        }, define.some_config.Time.Monitor_Heart_Beat_Time * 1000 * 2);
    };
    Master_ServerProxy.prototype.send = function (msg) {
        this.socket.send(msgCoder.encodeInnerData(msg));
    };
    Master_ServerProxy.prototype.heartbeatResponse = function () {
        var msg = { T: 4 /* heartbeatResponse */ };
        var buf = msgCoder.encodeInnerData(msg);
        this.socket.send(buf);
    };
    Master_ServerProxy.prototype.onData = function (_data) {
        var data;
        try {
            data = JSON.parse(_data.toString());
        }
        catch (err) {
            app.logger(interfaceDefine_1.loggerType.error, appUtil_1.concatStr("JSON parse error，close the monitor named ", this.sid, ", ", this.socket.remoteAddress));
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
            app.logger(interfaceDefine_1.loggerType.error, appUtil_1.concatStr("handle msg error, close it, ", this.sid, ", ", this.socket.remoteAddress, "\n", err.stack));
            this.socket.close();
        }
    };
    Master_ServerProxy.prototype.onClose = function () {
        clearTimeout(this.heartbeatTimeoutTimer);
        delete servers[this.sid];
        delete serversDataTmp.serverInfoIdMap[this.sid];
        var serverInfo = {
            "T": 2 /* removeServer */,
            "id": this.sid,
            "serverType": this.serverType
        };
        var serverInfoBuf = msgCoder.encodeInnerData(serverInfo);
        for (var sid in servers) {
            servers[sid].socket.send(serverInfoBuf);
        }
        app.logger(interfaceDefine_1.loggerType.error, appUtil_1.concatStr("a monitor disconnected  ", this.sid, ", ", this.socket.remoteAddress));
    };
    return Master_ServerProxy;
}());
exports.Master_ServerProxy = Master_ServerProxy;
/**
 * master处理cli代理
 */
var Master_ClientProxy = /** @class */ (function () {
    function Master_ClientProxy(socket) {
        this.heartbeatTimer = null;
        this.socket = socket;
        this.init();
    }
    Master_ClientProxy.prototype.init = function () {
        var socket = this.socket;
        this.heartbeatTimeOut();
        socket.on('data', this.onData.bind(this));
        socket.on('close', this.onClose.bind(this));
        app.logger(interfaceDefine_1.loggerType.info, appUtil_1.concatStr("get a new cli, ", socket.remoteAddress));
    };
    Master_ClientProxy.prototype.heartbeatTimeOut = function () {
        var self = this;
        clearTimeout(this.heartbeatTimer);
        this.heartbeatTimer = setTimeout(function () {
            app.logger(interfaceDefine_1.loggerType.error, appUtil_1.concatStr("heartbeat timeout, close the cli, " + self.socket.remoteAddress));
            self.socket.close();
        }, define.some_config.Time.Monitor_Heart_Beat_Time * 1000 * 2);
    };
    Master_ClientProxy.prototype.onData = function (_data) {
        var data;
        try {
            data = JSON.parse(_data.toString());
        }
        catch (err) {
            app.logger(interfaceDefine_1.loggerType.error, appUtil_1.concatStr("JSON parse error，close the cli, " + this.socket.remoteAddress));
            this.socket.close();
            return;
        }
        try {
            if (data.T === 2 /* heartbeat */) {
                this.heartbeatTimeOut();
            }
            else if (data.T === 3 /* cliMsg */) {
                app.logger(interfaceDefine_1.loggerType.info, appUtil_1.concatStr("master get command from the cli, " + this.socket.remoteAddress + " ==> " + JSON.stringify(data)));
                masterCli.deal_cli_msg(this, data);
            }
            else {
                app.logger(interfaceDefine_1.loggerType.error, appUtil_1.concatStr("the cli illegal data type close it, " + this.socket.remoteAddress));
                this.socket.close();
            }
        }
        catch (e) {
            app.logger(interfaceDefine_1.loggerType.error, appUtil_1.concatStr("cli handle msg err, close it " + this.socket.remoteAddress + "\n" + e.stack));
            this.socket.close();
        }
    };
    Master_ClientProxy.prototype.send = function (msg) {
        this.socket.send(msgCoder.encodeInnerData(msg));
    };
    Master_ClientProxy.prototype.onClose = function () {
        clearTimeout(this.heartbeatTimer);
        app.logger(interfaceDefine_1.loggerType.info, appUtil_1.concatStr("a cli disconnected, " + this.socket.remoteAddress));
    };
    return Master_ClientProxy;
}());
exports.Master_ClientProxy = Master_ClientProxy;
