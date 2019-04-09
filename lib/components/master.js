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
    tcpServer_1.default(app.port, startCb, newClientCb);
    function startCb() {
        var str = "server start: " + app.host + ":" + app.port + " / " + app.serverId;
        console.log(str);
        app.logger(interfaceDefine_1.loggerType.info, interfaceDefine_1.componentName.master, str);
        cb && cb();
        if (app.startMode === "all") {
            starter_1.runServers(app);
        }
    }
    function newClientCb(socket) {
        socket.unRegSocketMsgHandle = unRegSocketMsgHandle.bind(null, socket);
        socket.on('data', socket.unRegSocketMsgHandle);
        socket.unRegSocketCloseHandle = unRegSocketCloseHandle.bind(null, socket);
        socket.on('close', socket.unRegSocketCloseHandle);
        socket.registerTimer = setTimeout(function () {
            app.logger(interfaceDefine_1.loggerType.warn, interfaceDefine_1.componentName.master, "the socket connected to master register time out, close the socket: " + socket.socket.remoteAddress);
            socket.close();
        }, 10000);
    }
}
/**
 * socket尚未注册时，关闭的回调
 */
function unRegSocketCloseHandle(socket) {
    clearTimeout(socket.registerTimer);
}
;
/**
 * socket尚未注册时，收到消息的回调
 */
function unRegSocketMsgHandle(socket, _data) {
    var data;
    try {
        data = JSON.parse(_data.toString());
    }
    catch (err) {
        app.logger(interfaceDefine_1.loggerType.warn, interfaceDefine_1.componentName.master, "unregistered socket, JSON parse error, close it: " + socket.socket.remoteAddress);
        socket.close();
        return;
    }
    if (!data || data.T !== 1 /* register */) {
        app.logger(interfaceDefine_1.loggerType.warn, interfaceDefine_1.componentName.master, "unregistered socket, illegal data, close it: " + socket.socket.remoteAddress);
        socket.close();
        return;
    }
    // 判断是服务器，还是cli
    if (data.hasOwnProperty("serverToken")) {
        if (data.serverToken !== app.serverToken) {
            app.logger(interfaceDefine_1.loggerType.warn, interfaceDefine_1.componentName.master, "a monitor, illegal serverToken, close it: " + socket.socket.remoteAddress);
            socket.close();
            return;
        }
        if (!data.serverType || !data.serverInfo || !data.serverInfo.id || !data.serverInfo.host || !data.serverInfo.port) {
            app.logger(interfaceDefine_1.loggerType.warn, interfaceDefine_1.componentName.master, "a monitor, illegal serverInfo, close it: " + socket.socket.remoteAddress);
            socket.close();
            return;
        }
        new Master_ServerProxy(data, socket);
        return;
    }
    // 是cli？
    if (data.hasOwnProperty("clientToken")) {
        if (data.clientToken !== app.clientToken) {
            app.logger(interfaceDefine_1.loggerType.warn, interfaceDefine_1.componentName.master, "a cli, illegal clientToken, close it: " + socket.socket.remoteAddress);
            socket.close();
            return;
        }
        new Master_ClientProxy(socket);
        return;
    }
    app.logger(interfaceDefine_1.loggerType.warn, interfaceDefine_1.componentName.master, "master get a illegal socket, close it");
    socket.close();
}
;
/**
 * master处理服务器代理
 */
var Master_ServerProxy = /** @class */ (function () {
    function Master_ServerProxy(data, socket) {
        this.sid = "";
        this.serverType = "";
        this.socket = socket;
        this.init(data);
    }
    Master_ServerProxy.prototype.init = function (data) {
        var socket = this.socket;
        clearTimeout(socket.registerTimer);
        if (!!servers[data.serverInfo.id]) {
            app.logger(interfaceDefine_1.loggerType.warn, interfaceDefine_1.componentName.master, "master already has a monitor named " + data.serverInfo.id + ", close the socket: " + socket.socket.remoteAddress);
            socket.close();
            return;
        }
        this.heartBeatTimeOut();
        socket.removeListener("data", socket.unRegSocketMsgHandle);
        socket.unRegSocketMsgHandle = null;
        socket.on('data', this.processMsg.bind(this));
        socket.removeListener("close", socket.unRegSocketCloseHandle);
        socket.unRegSocketCloseHandle = null;
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
            if (servers[sid].serverType !== "rpc") {
                servers[sid].socket.send(socketInfoBuf);
            }
        }
        // 通知新加入的服务器，当前已经有哪些服务器了
        if (this.serverType !== "rpc") {
            var result = msgCoder.encodeInnerData(serversDataTmp);
            socket.send(result);
        }
        servers[this.sid] = this;
        serversDataTmp.serverInfoIdMap[this.sid] = {
            "serverType": data.serverType,
            "serverInfo": data.serverInfo
        };
        app.logger(interfaceDefine_1.loggerType.info, interfaceDefine_1.componentName.master, "master gets a new monitor named " + this.sid);
    };
    Master_ServerProxy.prototype.heartBeatTimeOut = function () {
        var self = this;
        clearTimeout(this.socket.heartBeatTimer);
        this.socket.heartBeatTimer = setTimeout(function () {
            app.logger(interfaceDefine_1.loggerType.warn, interfaceDefine_1.componentName.master, "heartbeat time out, close the monitor named " + self.sid);
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
    Master_ServerProxy.prototype.processMsg = function (_data) {
        var data;
        try {
            data = JSON.parse(_data.toString());
        }
        catch (err) {
            app.logger(interfaceDefine_1.loggerType.warn, interfaceDefine_1.componentName.master, "JSON parse error，close the monitor named " + this.sid);
            this.socket.close();
            return;
        }
        if (data.T === 2 /* heartbeat */) {
            this.heartBeatTimeOut();
            this.heartbeatResponse();
        }
        else if (data.T === 3 /* cliMsg */) {
            masterCli.deal_monitor_msg(data);
        }
    };
    Master_ServerProxy.prototype.onClose = function () {
        clearTimeout(this.socket.heartBeatTimer);
        delete servers[this.sid];
        delete serversDataTmp.serverInfoIdMap[this.sid];
        var serverInfo = {
            "T": 2 /* removeServer */,
            "id": this.sid,
            "serverType": this.serverType
        };
        var serverInfoBuf = msgCoder.encodeInnerData(serverInfo);
        for (var sid in servers) {
            if (servers[sid].serverType !== "rpc") {
                servers[sid].socket.send(serverInfoBuf);
            }
        }
        app.logger(interfaceDefine_1.loggerType.info, interfaceDefine_1.componentName.master, "a monitor disconnected : " + this.sid);
    };
    return Master_ServerProxy;
}());
exports.Master_ServerProxy = Master_ServerProxy;
/**
 * master处理cli代理
 */
var Master_ClientProxy = /** @class */ (function () {
    function Master_ClientProxy(socket) {
        this.socket = socket;
        this.init();
    }
    Master_ClientProxy.prototype.init = function () {
        var socket = this.socket;
        clearTimeout(socket.registerTimer);
        this.heartBeatTimeOut();
        socket.removeListener("data", socket.unRegSocketMsgHandle);
        socket.unRegSocketMsgHandle = null;
        socket.on('data', this.processMsg.bind(this));
        socket.removeListener("close", socket.unRegSocketCloseHandle);
        socket.unRegSocketCloseHandle = null;
        socket.on('close', this.onClose.bind(this));
        app.logger(interfaceDefine_1.loggerType.info, interfaceDefine_1.componentName.master, "master gets a new cli : " + socket.socket.remoteAddress);
    };
    Master_ClientProxy.prototype.heartBeatTimeOut = function () {
        var self = this;
        clearTimeout(this.socket.heartBeatTimer);
        this.socket.heartBeatTimer = setTimeout(function () {
            app.logger(interfaceDefine_1.loggerType.warn, interfaceDefine_1.componentName.master, "heartbeat time out, close the cli:" + self.socket.socket.remoteAddress);
            self.socket.close();
        }, define.some_config.Time.Monitor_Heart_Beat_Time * 1000 * 2);
    };
    Master_ClientProxy.prototype.processMsg = function (_data) {
        var data;
        try {
            data = JSON.parse(_data.toString());
        }
        catch (err) {
            app.logger(interfaceDefine_1.loggerType.warn, interfaceDefine_1.componentName.master, "JSON parse error，close the cli : " + this.socket.socket.remoteAddress);
            this.socket.close();
            return;
        }
        if (data.T === 2 /* heartbeat */) {
            this.heartBeatTimeOut();
        }
        else if (data.T === 3 /* cliMsg */) {
            app.logger(interfaceDefine_1.loggerType.info, interfaceDefine_1.componentName.master, "master get command from the cli : " + this.socket.socket.remoteAddress + " / " + JSON.stringify(data));
            masterCli.deal_cli_msg(this, data);
        }
    };
    Master_ClientProxy.prototype.send = function (msg) {
        this.socket.send(msgCoder.encodeInnerData(msg));
    };
    Master_ClientProxy.prototype.onClose = function () {
        clearTimeout(this.socket.heartBeatTimer);
        app.logger(interfaceDefine_1.loggerType.info, interfaceDefine_1.componentName.master, "a cli disconnected : " + this.socket.socket.remoteAddress);
    };
    return Master_ClientProxy;
}());
exports.Master_ClientProxy = Master_ClientProxy;
