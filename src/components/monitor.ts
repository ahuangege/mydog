/**
 * 非master服务器启动后，由此连接master服，互相认识，并处理相关逻辑
 */


import Application from "../application";
import { MonitorCli } from "./cliUtil";
import { TcpClient } from "./tcpClient";
import define = require("../util/define");
import { SocketProxy, ServerInfo, monitor_get_new_server, monitor_remove_server, loggerType, monitor_reg_master } from "../util/interfaceDefine";
import { encodeInnerData } from "./msgCoder";
import * as rpcClient from "./rpcClient";


export function start(_app: Application) {
    new monitor_client_proxy(_app);
}


export class monitor_client_proxy {
    private app: Application;
    private socket: SocketProxy = null as any;
    private monitorCli: MonitorCli;
    private heartbeatTimer: NodeJS.Timeout = null as any;
    private heartbeatTimeoutTimer: NodeJS.Timeout = null as any;

    private removeDiffServers: { [id: string]: string } = {}; // monitor重连后，待对比移除的server集合
    private needDiff: boolean = false; // 是否需要对比
    private diffTimer: NodeJS.Timeout = null as any;    // 对比倒计时

    constructor(app: Application) {
        this.app = app;
        this.monitorCli = new MonitorCli(app);
        this.doConnect(0);
    }

    /**
     * 连接master
     */
    private doConnect(delay: number) {
        let self = this;
        setTimeout(function () {
            let connectCb = function () {
                self.app.logger(loggerType.info, "monitor connected to master success");

                // 向master注册
                self.register();

                // 心跳包
                self.heartbeat();;
            };
            self.app.logger(loggerType.info, "monitor try to connect to master now");
            self.socket = new TcpClient(self.app.masterConfig.port, self.app.masterConfig.host, define.some_config.SocketBufferMaxLen, connectCb);
            self.socket.on("data", self.onData.bind(self));
            self.socket.on("close", self.onClose.bind(self));
        }, delay);
    }

    /**
     * 注册
     */
    private register() {
        let loginInfo: monitor_reg_master = {
            T: define.Monitor_To_Master.register,
            serverType: this.app.serverType,
            serverInfo: this.app.serverInfo,
            serverToken: this.app.serverToken
        };
        this.send(loginInfo);
    }

    /**
     * 收到消息
     */
    private onData(_data: Buffer) {
        let data: any = JSON.parse(_data.toString());

        if (data.T === define.Master_To_Monitor.addServer) {
            this.addServer((data as monitor_get_new_server).serverInfoIdMap);
        } else if (data.T === define.Master_To_Monitor.removeServer) {
            this.removeServer(data as monitor_remove_server);
        } else if (data.T === define.Master_To_Monitor.cliMsg) {
            this.monitorCli.deal_master_msg(this, data);
        } else if (data.T === define.Master_To_Monitor.heartbeatResponse) {
            clearTimeout(this.heartbeatTimeoutTimer);
            this.heartbeatTimeoutTimer = null as any;
        }
    }

    /**
     * socket关闭了
     */
    private onClose() {
        this.app.logger(loggerType.error, "monitor closed, try to reconnect master later");
        this.needDiff = true;
        this.removeDiffServers = {};
        clearTimeout(this.diffTimer);
        clearTimeout(this.heartbeatTimer);
        clearTimeout(this.heartbeatTimeoutTimer);
        this.heartbeatTimeoutTimer = null as any;
        this.doConnect(define.some_config.Time.Monitor_Reconnect_Time * 1000);
    }

    /**
     * 发送心跳
     */
    private heartbeat() {
        let self = this;
        let timeDelay = define.some_config.Time.Monitor_Heart_Beat_Time * 1000 - 5000 + Math.floor(5000 * Math.random());
        this.heartbeatTimer = setTimeout(function () {
            let heartbeatMsg = { "T": define.Monitor_To_Master.heartbeat };
            self.send(heartbeatMsg);
            self.heartbeatTimeout();
            self.heartbeat();
        }, timeDelay)
    }

    /**
     * 心跳超时
     */
    private heartbeatTimeout() {
        if (this.heartbeatTimeoutTimer !== null) {
            return;
        }
        let self = this;
        this.heartbeatTimeoutTimer = setTimeout(function () {
            self.app.logger(loggerType.error, "monitor heartbeat timeout, close the socket");
            self.socket.close();
        }, define.some_config.Time.Monitor_Heart_Beat_Timeout_Time * 1000)
    }

    /**
     * 发送消息（非buffer）
     */
    send(msg: any) {
        this.socket.send(encodeInnerData(msg));
    }

    /**
     * 新增服务器
     */
    private addServer(servers: { [id: string]: { "serverType": string, "serverInfo": ServerInfo } }) {
        if (this.needDiff) {
            this.diffTimerStart();
        }
        let serversApp = this.app.servers;
        let serversIdMap = this.app.serversIdMap;
        let server: { "serverType": string, "serverInfo": ServerInfo };
        let serverInfo: ServerInfo;
        for (let sid in servers) {
            server = servers[sid];
            serverInfo = server.serverInfo;
            if (this.needDiff) {
                this.addOrRemoveDiffServer(serverInfo.id, true, server.serverType);
            }
            let tmpServer: ServerInfo = serversIdMap[serverInfo.id];
            if (tmpServer && tmpServer.host === serverInfo.host && tmpServer.port === serverInfo.port) {    // 如果已经存在且ip配置相同，则忽略（不考虑其他配置，请开发者自己保证）
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
            rpcClient.ifCreateRpcClient(this.app, serverInfo)
        }
    }

    /**
     * 移除服务器
     */
    private removeServer(msg: monitor_remove_server) {
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
                    rpcClient.removeSocket(msg.id)
                    this.emitRemoveServer(msg.serverType, msg.id);
                    break;
                }
            }
        }
    }

    private addOrRemoveDiffServer(sid: string, add: boolean, serverType?: string) {
        if (add) {
            this.removeDiffServers[sid] = serverType as string;
        } else {
            delete this.removeDiffServers[sid];
        }
    }

    private diffTimerStart() {
        clearTimeout(this.diffTimer);
        let self = this;
        this.diffTimer = setTimeout(function () {
            self.diffFunc();
        }, 5000);     // 5秒后对比
    }


    private diffFunc() {
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
    private emitAddServer(serverType: string, id: string) {
        try {
            this.app.emit("onAddServer", serverType, id);
        } catch (e) {
            this.app.logger(loggerType.error, e.stack);
        }
    }

    /**
     * 发射移除服务器事件
     */
    private emitRemoveServer(serverType: string, id: string) {
        try {
            this.app.emit("onRemoveServer", serverType, id);
        } catch (e) {
            this.app.logger(loggerType.error, e.stack);
        }
    }
}


