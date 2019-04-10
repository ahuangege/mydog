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
var remoteFrontend = __importStar(require("./remoteFrontend"));
var rpcService = __importStar(require("./rpcService"));
var app;
function start(_app) {
    app = _app;
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
                app.logger(interfaceDefine_1.loggerType.info, interfaceDefine_1.componentName.monitor, "monitor connected to master success ");
                // 向master注册
                self.register();
                // 心跳包
                self.heartbeat();
                ;
            };
            app.logger(interfaceDefine_1.loggerType.info, interfaceDefine_1.componentName.monitor, "monitor try to connect to master now");
            self.socket = new tcpClient_1.TcpClient(app.masterConfig.port, app.masterConfig.host, connectCb);
            self.socket.on("data", self.onData.bind(self));
            self.socket.on("close", self.onClose.bind(self));
        }, delay);
    };
    /**
     * 注册
     */
    monitor_client_proxy.prototype.register = function () {
        var curServerInfo = null;
        if (app.serverType === "rpc") {
            curServerInfo = {
                "id": app.serverId,
                "host": app.host,
                "port": app.port
            };
        }
        else {
            curServerInfo = app.serverInfo;
        }
        var loginInfo = {
            T: 1 /* register */,
            serverType: app.serverType,
            serverInfo: curServerInfo,
            serverToken: app.serverToken
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
        }
    };
    /**
     * socket关闭了
     */
    monitor_client_proxy.prototype.onClose = function () {
        app.logger(interfaceDefine_1.loggerType.warn, interfaceDefine_1.componentName.monitor, "monitor closed, try to reconnect master later");
        this.needDiff = true;
        this.removeDiffServers = {};
        clearTimeout(this.diffTimer);
        clearTimeout(this.heartbeatTimer);
        clearTimeout(this.heartbeatTimeoutTimer);
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
        var self = this;
        this.heartbeatTimeoutTimer = setTimeout(function () {
            app.logger(interfaceDefine_1.loggerType.warn, interfaceDefine_1.componentName.monitor, "monitor heartbeat timeout, close the socket");
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
        var serversApp = app.servers;
        var serversIdMap = app.serversIdMap;
        var server;
        var serverInfo;
        for (var sid in servers) {
            server = servers[sid];
            serverInfo = server.serverInfo;
            if (this.needDiff) {
                this.addOrRemoveDiffServer(serverInfo.id, true, server.serverType);
            }
            var tmpServer = void 0;
            if (server.serverType === "rpc") {
                tmpServer = app.rpcServersIdMap[serverInfo.id];
                if (tmpServer && tmpServer.host === serverInfo.host && tmpServer.port === serverInfo.port) { // 如果已经存在且ip配置相同，则忽略
                    continue;
                }
                app.rpcServersIdMap[serverInfo.id] = serverInfo;
                rpcService.addRpcServer(serverInfo);
                continue;
            }
            tmpServer = serversIdMap[serverInfo.id];
            if (tmpServer && tmpServer.host === serverInfo.host && tmpServer.port === serverInfo.port) { // 如果已经存在且ip配置相同，则忽略（不考虑其他配置，请开发者自己保证）
                continue;
            }
            if (!serversApp[server.serverType]) {
                serversApp[server.serverType] = [];
            }
            if (!!tmpServer) {
                for (var i = 0, len = serversApp[server.serverType].length; i < len; i++) {
                    if (serversApp[server.serverType][i].id === tmpServer.id) {
                        serversApp[server.serverType].splice(i, 1);
                        if (app.frontend && !app.alone) {
                            remoteFrontend.removeServer({
                                "serverType": server.serverType,
                                "id": tmpServer.id
                            });
                            this.emitRemoveServer(server.serverType, tmpServer.id);
                        }
                    }
                }
            }
            serversApp[server.serverType].push(serverInfo);
            serversIdMap[serverInfo.id] = serverInfo;
            this.emitAddServer(server.serverType, serverInfo.id);
            if (app.frontend && !app.alone && !serverInfo.frontend && !serverInfo.alone) {
                remoteFrontend.addServer(server);
            }
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
        if (msg.serverType === "rpc") {
            delete app.rpcServersIdMap[msg.id];
            rpcService.removeRpcServer(msg.id);
            return;
        }
        delete app.serversIdMap[msg.id];
        var serversApp = app.servers;
        if (serversApp[msg.serverType]) {
            for (var i = 0; i < serversApp[msg.serverType].length; i++) {
                if (serversApp[msg.serverType][i].id === msg.id) {
                    serversApp[msg.serverType].splice(i, 1);
                    if (app.frontend && !app.alone) {
                        remoteFrontend.removeServer({
                            "serverType": msg.serverType,
                            "id": msg.id
                        });
                        this.emitRemoveServer(msg.serverType, msg.id);
                    }
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
        var servers = app.servers;
        for (var serverType in servers) {
            for (var i = 0, len = servers[serverType].length; i < len; i++) {
                var id = servers[serverType][i].id;
                if (id === app.serverId) {
                    continue;
                }
                if (!this.removeDiffServers[id]) {
                    delete app.serversIdMap[id];
                    servers[serverType].splice(i, 1);
                    remoteFrontend.removeServer({ "serverType": serverType, "id": id });
                    this.emitRemoveServer(serverType, id);
                }
            }
        }
        for (var id in app.rpcServersIdMap) {
            if (id === app.serverId) {
                continue;
            }
            if (!this.removeDiffServers[id]) {
                delete app.rpcServersIdMap[id];
                rpcService.removeRpcServer(id);
            }
        }
        this.removeDiffServers = {};
    };
    /**
     * 发射添加服务器事件
     */
    monitor_client_proxy.prototype.emitAddServer = function (serverType, id) {
        try {
            app.emit("onAddServer", serverType, id);
        }
        catch (e) {
            app.logger(interfaceDefine_1.loggerType.error, interfaceDefine_1.componentName.monitor, e);
        }
    };
    /**
     * 发射移除服务器事件
     */
    monitor_client_proxy.prototype.emitRemoveServer = function (serverType, id) {
        try {
            app.emit("onRemoveServer", serverType, id);
        }
        catch (e) {
            app.logger(interfaceDefine_1.loggerType.error, interfaceDefine_1.componentName.monitor, e);
        }
    };
    return monitor_client_proxy;
}());
exports.monitor_client_proxy = monitor_client_proxy;
