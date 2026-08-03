/**
 * After the non-master server is started, it connects to the master server, knows each other, and processes related logic
 */


import Application from "../application";
import { MonitorCli } from "./cliUtil";
import { TcpClient } from "./tcpClient";
import * as define from "../util/define";
import { SocketProxy, monitor_get_new_server, monitor_remove_server, loggerLevel, monitor_reg_master, ServerInfo } from "../util/interfaceDefine";
import { encodeInnerData } from "./msgCoder";
import * as rpcClient from "./rpcClient";
import * as path from "path";
import { delayMs, randBetweenInt } from "mydog/src/util/starter";
let meFilename = `[${path.basename(__filename, ".js")}.ts]`;

export function start(_app: Application) {
    new monitor_client_proxy(_app);
}


export class monitor_client_proxy {
    private app: Application;
    private socket: SocketProxy = null as any;
    private monitorCli: MonitorCli;
    private heartbeatTimer: NodeJS.Timeout = null as any;
    private heartbeatTimeoutTimer: NodeJS.Timeout = null as any;

    private serversIdMap = new Map<string, ServerInfo>(); // 从 master 那里获得的所有服务器

    private removeDiffServers: { [id: string]: string } = {}; // After the monitor is reconnected, the server set to be compared and removed
    private needDiff: boolean = false; // whether need to compare
    private diffTimer: NodeJS.Timeout = null as any;    // diff timeout
    private reconnectCnt = 0;

    constructor(app: Application) {
        this.app = app;
        this.monitorCli = new MonitorCli(app);

        const selfServerInfo = app.serverInfo;
        this.serversIdMap.set(selfServerInfo.id, selfServerInfo);

        const rand = randBetweenInt(1000, 5000);
        this.doConnect(rand);
    }

    /**
     * Connect master
     */
    private doConnect(delay: number) {
        setTimeout(() => {
            const connectCb = () => {
                this.app.logger(loggerLevel.debug, `${meFilename} connected to master success`);

                this.reconnectCnt = 0;

                // Register with the master
                this.register();

                // Heartbeat package
                this.heartbeat();;
            };
            this.app.logger(loggerLevel.debug, `${meFilename} try to connect to master now`);
            this.socket = new TcpClient(this.app.masterConfig.port, this.app.masterConfig.host, define.some_config.SocketBufferMaxLen, false, connectCb);
            this.socket.on("data", this.onData.bind(this));
            this.socket.on("close", this.onClose.bind(this));
        }, delay);
    }

    /**
     * register
     */
    private register() {
        let tokenConfig = this.app.someconfig.recognizeToken || {};
        let serverToken = tokenConfig.serverToken || define.some_config.Server_Token;

        let loginInfo: monitor_reg_master = {
            T: define.Monitor_To_Master.register,
            serverInfo: this.app.serverInfo,
            serverToken: serverToken
        };
        this.send(loginInfo);
    }

    /**
     * Received the msg
     */
    private onData(_data: Buffer) {
        try {
            let data: any = JSON.parse(_data.toString());

            if (data.T === define.Master_To_Monitor.addServer) {
                this.addServer((data as monitor_get_new_server).servers);
            } else if (data.T === define.Master_To_Monitor.removeServer) {
                this.removeServer(data as monitor_remove_server);
            } else if (data.T === define.Master_To_Monitor.cliMsg) {
                this.monitorCli.deal_master_msg(this, data);
            } else if (data.T === define.Master_To_Monitor.heartbeatResponse) {
                clearTimeout(this.heartbeatTimeoutTimer);
                this.heartbeatTimeoutTimer = null as any;
            } else if (data.T === define.Master_To_Monitor.invalidCloseSelf) {
                this.invalidCloseSelf(data);
            }
        }
        catch (e: any) {
            this.app.logger(loggerLevel.error, e);
        }
    }

    /**
     * closed
     */
    private onClose() {
        this.app.logger(loggerLevel.error, `${meFilename} socket closed, try to reconnect master later`);
        this.needDiff = true;
        this.removeDiffServers = {};
        clearTimeout(this.diffTimer);
        clearTimeout(this.heartbeatTimer);
        clearTimeout(this.heartbeatTimeoutTimer);
        this.heartbeatTimeoutTimer = null as any;

        this.reconnectCnt++;
        let delayMs = define.some_config.Time.Monitor_Reconnect_Time * 1000 * this.reconnectCnt;
        delayMs = Math.min(delayMs, 30 * 1000);
        this.doConnect(randBetweenInt(delayMs, delayMs + 2000));
    }

    /**
     * Send heartbeat
     */
    private heartbeat() {
        let timeDelay = define.some_config.Time.Monitor_Heart_Beat_Time * 1000 - 5000 + Math.floor(5000 * Math.random());
        this.heartbeatTimer = setTimeout(() => {
            let heartbeatMsg = { "T": define.Monitor_To_Master.heartbeat };
            this.send(heartbeatMsg);
            this.heartbeatTimeout();
            this.heartbeatTimer.refresh();
        }, timeDelay)
    }

    /**
     * Heartbeat timeout
     */
    private heartbeatTimeout() {
        if (this.heartbeatTimeoutTimer !== null) {
            return;
        }
        let self = this;
        this.heartbeatTimeoutTimer = setTimeout(function () {
            self.app.logger(loggerLevel.error, `${meFilename} heartbeat timeout, close the socket`);
            self.socket.close();
        }, define.some_config.Time.Monitor_Heart_Beat_Timeout_Time * 1000)
    }

    /**
     * Send message (not buffer)
     */
    send(msg: any) {
        this.socket.send(encodeInnerData(msg));
    }

    /**
     * Add server
     */
    private addServer(servers: { [id: string]: ServerInfo }) {
        if (this.needDiff) {
            this.diffTimerStart();
        }
        let serversApp = this.app.servers;
        let serversIdMap = this.app.serversIdMap;
        let serverInfo: ServerInfo;
        for (let sid in servers) {
            serverInfo = servers[sid];
            if (this.needDiff) {
                this.addOrRemoveDiffServer(serverInfo.id, true, serverInfo.serverType);
            }
            let tmpServer: ServerInfo = serversIdMap[serverInfo.id];
            if (tmpServer && tmpServer.host === serverInfo.host && tmpServer.port === serverInfo.port) {    // If it already exists and the ip configuration is the same, ignore it (other configurations are not considered, please guarantee by the developer)
                continue;
            }
            if (!serversApp[serverInfo.serverType]) {
                serversApp[serverInfo.serverType] = [];
            }
            if (!!tmpServer) {
                for (let i = serversApp[serverInfo.serverType].length - 1; i >= 0; i--) {
                    if (serversApp[serverInfo.serverType][i].id === tmpServer.id) {
                        serversApp[serverInfo.serverType].splice(i, 1);
                        rpcClient.removeSocket(tmpServer.id);
                        break;
                    }
                }
            }
            serversApp[serverInfo.serverType].push(serverInfo);
            serversIdMap[serverInfo.id] = serverInfo;
            rpcClient.ifCreateRpcClient(this.app, serverInfo)
        }
    }

    /**
     * Remove server
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
        }, 5000);     // Compare after 5 seconds
    }

    /**
     * 比对原因：与master断开连接期间，如果另一台逻辑服挂了，本服不能断定该服是否移除，
     * 因为添加和删除统一由master通知，所以与master断开期间，不可更改与其他服的关系，
     * 待本服重新连接上master后，通过比对，移除无效服务器
     * 
     * (Reason for comparison: During the disconnection from the master, if another logical server hangs up, 
     * the server cannot determine whether the server will be removed, because the addition and deletion are uniformly notified by the master,
     *  so during the disconnection from the master, it cannot be changed. Server relationship, 
     * after the server reconnects to the master, through the comparison, remove the invalid server)
     */
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
                    let tmpInfo = this.app.serversIdMap[id];
                    delete this.app.serversIdMap[id];
                    servers[serverType].splice(i, 1);
                    rpcClient.removeSocket(id);
                }
            }
        }
        this.removeDiffServers = {};
    }

    /** 被master认定非法，关闭进程 */
    async invalidCloseSelf(data: { errMsg: string }) {
        try {
            this.app.logger(loggerLevel.error, "mydog_monitor_close_self : " + data.errMsg);
            setImmediate(() => {
                throw new Error("mydog_monitor_close_self : " + data.errMsg);
            });

            let exitFunc = this.app.someconfig.onBeforeExit;
            if (exitFunc) {
                await Promise.race([delayMs(10 * 1000), exitFunc()]);
            }
        } finally {
            setTimeout(() => {
                process.exit();
            }, 1000)
        }
    }

}