/**
 * After the non-master server is started, it connects to the master server, knows each other, and processes related logic
 */


import Application from "../application";
import { MonitorCli } from "./cliUtil";
import { TcpClient } from "./tcpClient";
import * as define from "../util/define";
import { SocketProxy, loggerLevel, monitor_reg_master, ServerInfo, monitor_syncAllServers, monitor_updateServers } from "../util/interfaceDefine";
import { encodeInnerData } from "./msgCoder";
import * as rpcClient from "./rpcClient";
import * as path from "path";
import { delayMs, randBetweenInt } from "../util/starter";

let meFilename = `[${path.basename(__filename, ".js")}.ts]`;

export function start(_app: Application) {
    const recognizeToken = _app.someconfig.recognizeToken || {};
    const useMonitor = recognizeToken.useMonitor ?? true;
    if (useMonitor) {
        new monitor_client_proxy(_app);
    }
}


export class monitor_client_proxy {
    private app: Application;
    private socket: SocketProxy = null as any;
    private monitorCli: MonitorCli;
    private heartbeatTimer: NodeJS.Timeout = null as any;
    private heartbeatTimeoutTimer: NodeJS.Timeout = null as any;
    private reconnectCnt = 0;
    private isDie = false;
    private connectTimeoutTimer: NodeJS.Timeout = null;

    private isFirstSyncAll = true;
    private serversIdMap = new Map<string, ServerInfo>(); // 从 master 那里获得的所有服务器

    private tmpServersIdMap = new Map<string, ServerInfo>(); // 断线重连后，临时存储的最终服务器
    private delaySyncTimer: NodeJS.Timeout = null as any; // 延迟比对计时器
    private delayStartTime = 0;


    constructor(app: Application) {
        this.app = app;
        this.monitorCli = new MonitorCli(app);


        const rand = randBetweenInt(200, 2000);
        this.doConnect(rand);
    }

    /**
     * Connect master
     */
    private doConnect(delay: number) {
        if (this.isDie) {
            return;
        }
        this.connectTimeoutTimer = setTimeout(() => {
            if (this.isDie) {
                return;
            }

            const connectCb = () => {
                this.app.logger(loggerLevel.debug, `${meFilename} connected to master success`);

                // Register with the master
                this.register();

                // Heartbeat package
                this.heartbeat();
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

            if (data.T === define.Master_To_Monitor.syncAllServers) {
                this.syncAllServers((data as monitor_syncAllServers));
            } else if (data.T === define.Master_To_Monitor.updateServers) {
                this.updateServers(data as monitor_updateServers);
            } else if (data.T === define.Master_To_Monitor.cliMsg) {
                this.monitorCli.deal_master_msg(this, data);
            } else if (data.T === define.Master_To_Monitor.heartbeatResponse) {
                clearTimeout(this.heartbeatTimeoutTimer);
                this.heartbeatTimeoutTimer = null as any;
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
        clearTimeout(this.heartbeatTimer);
        clearTimeout(this.heartbeatTimeoutTimer);
        this.heartbeatTimeoutTimer = null as any;
        clearTimeout(this.delaySyncTimer);
        this.delaySyncTimer = null as any;
        this.tmpServersIdMap.clear();
        clearTimeout(this.connectTimeoutTimer);


        let delayMs = define.some_config.Time.Monitor_Reconnect_Time * 1000 * Math.pow(2, this.reconnectCnt); // 指数退避
        const rand = 0.7 + Math.random() * 0.4;
        delayMs = Math.floor(delayMs * rand); // 随机抖动
        delayMs = Math.min(delayMs, 30 * 1000); // 封顶

        this.reconnectCnt++;
        this.doConnect(delayMs);
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
            this.heartbeat(); // 重新随机抖动发送心跳
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



    syncAllServers(data: monitor_syncAllServers) {
        this.reconnectCnt = 0;

        if (this.isFirstSyncAll) {
            // 首次，直接抛出所有服务器
            this.isFirstSyncAll = false;
            for (const one of data.all) {
                this.serversIdMap.set(one.id, one);
                this.app.addServer(one);
            }
            return;
        }

        /**
         * 断线重连情况，可能是 master 异常，此时本地维护的服务器列表暂时不变，一定时间待master基本同步完后，再比对
         */
        this.tmpServersIdMap.clear();
        for (const one of data.all) {
            this.tmpServersIdMap.set(one.id, one);
        }

        this.delayStartTime = Date.now();
        clearTimeout(this.delaySyncTimer);
        this.delaySyncTimer = setTimeout(() => {
            // 5秒内没有 updateServers 更新，则认为master已同步完毕
            this.checkSyncServers();
        }, 5000);

    }

    updateServers(data: monitor_updateServers) {
        if (this.delaySyncTimer) {
            // 待比对中，临时存储
            for (const one of data.update) {
                this.tmpServersIdMap.set(one.id, one);
            }
            for (const sid of data.del) {
                this.tmpServersIdMap.delete(sid);
            }

            if (Date.now() - this.delayStartTime > 35 * 1000) {
                // 延迟已足够久，开始比对
                this.checkSyncServers();
            } else {
                this.delaySyncTimer.refresh();
            }
        } else {
            for (const one of data.update) {
                this.serversIdMap.set(one.id, one);
                this.app.addServer(one);
            }
            for (const sid of data.del) {
                this.serversIdMap.delete(sid);
                this.app.removeServer(sid);
            }
        }
    }

    /** 比对 */
    checkSyncServers() {
        clearTimeout(this.delaySyncTimer);
        this.delaySyncTimer = null as any;

        const oldMap = this.serversIdMap;
        this.serversIdMap = this.tmpServersIdMap;
        this.tmpServersIdMap = new Map();

        for (const [sid] of oldMap) {
            if (!this.serversIdMap.has(sid)) {
                this.app.removeServer(sid);
            }
        }

        for (const [sid, one] of this.serversIdMap) {
            const old = oldMap.get(sid);
            if (!old || old.host !== one.host || old.port !== one.port) {
                this.app.addServer(one);
            }
        }
    }
}