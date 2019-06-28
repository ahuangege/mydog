"use strict";
/**
 * 非master服务器启动后，由此连接master服，互相认识，并处理相关逻辑
 */
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
var cliUtil_1 = require("./cliUtil");
var tcpClient_1 = require("./tcpClient");
var define = require("../util/define");
var interfaceDefine_1 = require("../util/interfaceDefine");
var msgCoder_1 = require("./msgCoder");
var rpcClient = __importStar(require("./rpcClient"));
function start(_app) {
    new monitor_client_proxy(_app);
}
exports.start = start;
var monitor_client_proxy = /** @class */ (function () {
    function monitor_client_proxy(app) {
        this.socket = null;
        this.heartbeatTimer = null;
        this.heartbeatTimeoutTimer = null;
        this.removeDiffServers = {}; // monitor重连后，待对比移除的server集合
        this.needDiff = false; // 是否需要对比
        this.diffTimer = null; // 对比倒计时
        this.app = app;
        this.monitorCli = new cliUtil_1.MonitorCli(app);
        this.doConnect(0);
    }
    /**
     * 连接master
     */
    monitor_client_proxy.prototype.doConnect = function (delay) {
        var self = this;
        setTimeout(function () {
            var connectCb = function () {
                self.app.logger(interfaceDefine_1.loggerType.info, "monitor connected to master success");
                // 向master注册
                self.register();
                // 心跳包
                self.heartbeat();
                ;
            };
            self.app.logger(interfaceDefine_1.loggerType.info, "monitor try to connect to master now");
            self.socket = new tcpClient_1.TcpClient(self.app.masterConfig.port, self.app.masterConfig.host, define.some_config.SocketBufferMaxLen, connectCb);
            self.socket.on("data", self.onData.bind(self));
            self.socket.on("close", self.onClose.bind(self));
        }, delay);
    };
    /**
     * 注册
     */
    monitor_client_proxy.prototype.register = function () {
        var loginInfo = {
            T: 1 /* register */,
            serverType: this.app.serverType,
            serverInfo: this.app.serverInfo,
            serverToken: this.app.serverToken
        };
        this.send(loginInfo);
    };
    /**
     * 收到消息
     */
    monitor_client_proxy.prototype.onData = function (_data) {
        var data = JSON.parse(_data.toString());
        if (data.T === 1 /* addServer */) {
            this.addServer(data.serverInfoIdMap);
        }
        else if (data.T === 2 /* removeServer */) {
            this.removeServer(data);
        }
        else if (data.T === 3 /* cliMsg */) {
            this.monitorCli.deal_master_msg(this, data);
        }
        else if (data.T === 4 /* heartbeatResponse */) {
            clearTimeout(this.heartbeatTimeoutTimer);
            this.heartbeatTimeoutTimer = null;
        }
    };
    /**
     * socket关闭了
     */
    monitor_client_proxy.prototype.onClose = function () {
        this.app.logger(interfaceDefine_1.loggerType.error, "monitor closed, try to reconnect master later");
        this.needDiff = true;
        this.removeDiffServers = {};
        clearTimeout(this.diffTimer);
        clearTimeout(this.heartbeatTimer);
        clearTimeout(this.heartbeatTimeoutTimer);
        this.heartbeatTimeoutTimer = null;
        this.doConnect(define.some_config.Time.Monitor_Reconnect_Time * 1000);
    };
    /**
     * 发送心跳
     */
    monitor_client_proxy.prototype.heartbeat = function () {
        var self = this;
        var timeDelay = define.some_config.Time.Monitor_Heart_Beat_Time * 1000 - 5000 + Math.floor(5000 * Math.random());
        this.heartbeatTimer = setTimeout(function () {
            var heartbeatMsg = { "T": 2 /* heartbeat */ };
            self.send(heartbeatMsg);
            self.heartbeatTimeout();
            self.heartbeat();
        }, timeDelay);
    };
    /**
     * 心跳超时
     */
    monitor_client_proxy.prototype.heartbeatTimeout = function () {
        if (this.heartbeatTimeoutTimer !== null) {
            return;
        }
        var self = this;
        this.heartbeatTimeoutTimer = setTimeout(function () {
            self.app.logger(interfaceDefine_1.loggerType.error, "monitor heartbeat timeout, close the socket");
            self.socket.close();
        }, define.some_config.Time.Monitor_Heart_Beat_Timeout_Time * 1000);
    };
    /**
     * 发送消息（非buffer）
     */
    monitor_client_proxy.prototype.send = function (msg) {
        this.socket.send(msgCoder_1.encodeInnerData(msg));
    };
    /**
     * 新增服务器
     */
    monitor_client_proxy.prototype.addServer = function (servers) {
        if (this.needDiff) {
            this.diffTimerStart();
        }
        var serversApp = this.app.servers;
        var serversIdMap = this.app.serversIdMap;
        var server;
        var serverInfo;
        for (var sid in servers) {
            server = servers[sid];
            serverInfo = server.serverInfo;
            if (this.needDiff) {
                this.addOrRemoveDiffServer(serverInfo.id, true, server.serverType);
            }
            var tmpServer = serversIdMap[serverInfo.id];
            if (tmpServer && tmpServer.host === serverInfo.host && tmpServer.port === serverInfo.port) { // 如果已经存在且ip配置相同，则忽略（不考虑其他配置，请开发者自己保证）
                continue;
            }
            if (!serversApp[server.serverType]) {
                serversApp[server.serverType] = [];
            }
            if (!!tmpServer) {
                for (var i = serversApp[server.serverType].length - 1; i >= 0; i--) {
                    if (serversApp[server.serverType][i].id === tmpServer.id) {
                        serversApp[server.serverType].splice(i, 1);
                        rpcClient.removeSocket(tmpServer.id);
                        this.emitRemoveServer(server.serverType, tmpServer.id);
                        break;
                    }
                }
            }
            serversApp[server.serverType].push(serverInfo);
            serversIdMap[serverInfo.id] = serverInfo;
            this.emitAddServer(server.serverType, serverInfo.id);
            rpcClient.ifCreateRpcClient(this.app, serverInfo);
        }
    };
    /**
     * 移除服务器
     */
    monitor_client_proxy.prototype.removeServer = function (msg) {
        if (this.needDiff) {
            this.diffTimerStart();
            this.addOrRemoveDiffServer(msg.id, false);
        }
        delete this.app.serversIdMap[msg.id];
        var serversApp = this.app.servers;
        if (serversApp[msg.serverType]) {
            for (var i = 0; i < serversApp[msg.serverType].length; i++) {
                if (serversApp[msg.serverType][i].id === msg.id) {
                    serversApp[msg.serverType].splice(i, 1);
                    rpcClient.removeSocket(msg.id);
                    this.emitRemoveServer(msg.serverType, msg.id);
                    break;
                }
            }
        }
    };
    monitor_client_proxy.prototype.addOrRemoveDiffServer = function (sid, add, serverType) {
        if (add) {
            this.removeDiffServers[sid] = serverType;
        }
        else {
            delete this.removeDiffServers[sid];
        }
    };
    monitor_client_proxy.prototype.diffTimerStart = function () {
        clearTimeout(this.diffTimer);
        var self = this;
        this.diffTimer = setTimeout(function () {
            self.diffFunc();
        }, 5000); // 5秒后对比
    };
    monitor_client_proxy.prototype.diffFunc = function () {
        this.needDiff = false;
        var servers = this.app.servers;
        for (var serverType in servers) {
            for (var i = servers[serverType].length - 1; i >= 0; i--) {
                var id = servers[serverType][i].id;
                if (id === this.app.serverId) {
                    continue;
                }
                if (!this.removeDiffServers[id]) {
                    delete this.app.serversIdMap[id];
                    servers[serverType].splice(i, 1);
                    rpcClient.removeSocket(id);
                    this.emitRemoveServer(serverType, id);
                }
            }
        }
        this.removeDiffServers = {};
    };
    /**
     * 发射添加服务器事件
     */
    monitor_client_proxy.prototype.emitAddServer = function (serverType, id) {
        try {
            this.app.emit("onAddServer", serverType, id);
        }
        catch (e) {
            this.app.logger(interfaceDefine_1.loggerType.error, e.stack);
        }
    };
    /**
     * 发射移除服务器事件
     */
    monitor_client_proxy.prototype.emitRemoveServer = function (serverType, id) {
        try {
            this.app.emit("onRemoveServer", serverType, id);
        }
        catch (e) {
            this.app.logger(interfaceDefine_1.loggerType.error, e.stack);
        }
    };
    return monitor_client_proxy;
}());
exports.monitor_client_proxy = monitor_client_proxy;
