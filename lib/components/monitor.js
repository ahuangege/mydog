"use strict";
/**
 * 非master服务器启动后，由此连接master服，互相认识，并处理相关逻辑
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.monitor_client_proxy = exports.start = void 0;
const cliUtil_1 = require("./cliUtil");
const tcpClient_1 = require("./tcpClient");
const define = require("../util/define");
const msgCoder_1 = require("./msgCoder");
const rpcClient = __importStar(require("./rpcClient"));
function start(_app) {
    new monitor_client_proxy(_app);
}
exports.start = start;
class monitor_client_proxy {
    constructor(app) {
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
    doConnect(delay) {
        let self = this;
        setTimeout(function () {
            let connectCb = function () {
                self.app.logger("info" /* info */, "monitor connected to master success");
                // 向master注册
                self.register();
                // 心跳包
                self.heartbeat();
                ;
            };
            self.app.logger("info" /* info */, "monitor try to connect to master now");
            self.socket = new tcpClient_1.TcpClient(self.app.masterConfig.port, self.app.masterConfig.host, define.some_config.SocketBufferMaxLen, true, connectCb);
            self.socket.on("data", self.onData.bind(self));
            self.socket.on("close", self.onClose.bind(self));
        }, delay);
    }
    /**
     * 注册
     */
    register() {
        let tokenConfig = this.app.someconfig.recognizeToken || {};
        let serverToken = tokenConfig.serverToken || define.some_config.Server_Token;
        let loginInfo = {
            T: 1 /* register */,
            serverType: this.app.serverType,
            serverInfo: this.app.serverInfo,
            serverToken: serverToken
        };
        this.send(loginInfo);
    }
    /**
     * 收到消息
     */
    onData(_data) {
        let data = JSON.parse(_data.toString());
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
    }
    /**
     * socket关闭了
     */
    onClose() {
        this.app.logger("error" /* error */, "monitor closed, try to reconnect master later");
        this.needDiff = true;
        this.removeDiffServers = {};
        clearTimeout(this.diffTimer);
        clearTimeout(this.heartbeatTimer);
        clearTimeout(this.heartbeatTimeoutTimer);
        this.heartbeatTimeoutTimer = null;
        this.doConnect(define.some_config.Time.Monitor_Reconnect_Time * 1000);
    }
    /**
     * 发送心跳
     */
    heartbeat() {
        let self = this;
        let timeDelay = define.some_config.Time.Monitor_Heart_Beat_Time * 1000 - 5000 + Math.floor(5000 * Math.random());
        this.heartbeatTimer = setTimeout(function () {
            let heartbeatMsg = { "T": 2 /* heartbeat */ };
            self.send(heartbeatMsg);
            self.heartbeatTimeout();
            self.heartbeat();
        }, timeDelay);
    }
    /**
     * 心跳超时
     */
    heartbeatTimeout() {
        if (this.heartbeatTimeoutTimer !== null) {
            return;
        }
        let self = this;
        this.heartbeatTimeoutTimer = setTimeout(function () {
            self.app.logger("error" /* error */, "monitor heartbeat timeout, close the socket");
            self.socket.close();
        }, define.some_config.Time.Monitor_Heart_Beat_Timeout_Time * 1000);
    }
    /**
     * 发送消息（非buffer）
     */
    send(msg) {
        this.socket.send(msgCoder_1.encodeInnerData(msg));
    }
    /**
     * 新增服务器
     */
    addServer(servers) {
        if (this.needDiff) {
            this.diffTimerStart();
        }
        let serversApp = this.app.servers;
        let serversIdMap = this.app.serversIdMap;
        let server;
        let serverInfo;
        for (let sid in servers) {
            server = servers[sid];
            serverInfo = server.serverInfo;
            if (this.needDiff) {
                this.addOrRemoveDiffServer(serverInfo.id, true, server.serverType);
            }
            let tmpServer = serversIdMap[serverInfo.id];
            if (tmpServer && tmpServer.host === serverInfo.host && tmpServer.port === serverInfo.port) { // 如果已经存在且ip配置相同，则忽略（不考虑其他配置，请开发者自己保证）
                continue;
            }
            if (!serversApp[server.serverType]) {
                serversApp[server.serverType] = [];
            }
            if (!!tmpServer) {
                for (let i = serversApp[server.serverType].length - 1; i >= 0; i--) {
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
    }
    /**
     * 移除服务器
     */
    removeServer(msg) {
        if (this.needDiff) {
            this.diffTimerStart();
            this.addOrRemoveDiffServer(msg.id, false);
        }
        delete this.app.serversIdMap[msg.id];
        let serversApp = this.app.servers;
        if (serversApp[msg.serverType]) {
            for (let i = 0; i < serversApp[msg.serverType].length; i++) {
                if (serversApp[msg.serverType][i].id === msg.id) {
                    serversApp[msg.serverType].splice(i, 1);
                    rpcClient.removeSocket(msg.id);
                    this.emitRemoveServer(msg.serverType, msg.id);
                    break;
                }
            }
        }
    }
    addOrRemoveDiffServer(sid, add, serverType) {
        if (add) {
            this.removeDiffServers[sid] = serverType;
        }
        else {
            delete this.removeDiffServers[sid];
        }
    }
    diffTimerStart() {
        clearTimeout(this.diffTimer);
        let self = this;
        this.diffTimer = setTimeout(function () {
            self.diffFunc();
        }, 5000); // 5秒后对比
    }
    /**
     * 比对原因：与master断开连接期间，如果另一台逻辑服挂了，本服不能断定该服是否移除，
     * 因为添加和删除统一由master通知，所以与master断开期间，不可更改与其他服的关系，
     * 待本服重新连接上master后，通过比对，移除无效服务器
     */
    diffFunc() {
        this.needDiff = false;
        let servers = this.app.servers;
        for (let serverType in servers) {
            for (let i = servers[serverType].length - 1; i >= 0; i--) {
                let id = servers[serverType][i].id;
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
    }
    /**
     * 发射添加服务器事件
     */
    emitAddServer(serverType, id) {
        process.nextTick(() => {
            this.app.emit("onAddServer", serverType, id);
        });
    }
    /**
     * 发射移除服务器事件
     */
    emitRemoveServer(serverType, id) {
        process.nextTick(() => {
            this.app.emit("onRemoveServer", serverType, id);
        });
    }
}
exports.monitor_client_proxy = monitor_client_proxy;
