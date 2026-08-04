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
    private reconnectCnt = 0;

    private serversIdMap = new Map<string, ServerInfo>(); // 从 master 那里获得的所有服务器


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
        setTimeout(() => {
            const connectCb = () => {
                this.app.logger(loggerLevel.debug, `${meFilename} connected to master success`);

                this.reconnectCnt = 0;

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


    /** 被master认定非法，关闭进程 */
    async invalidCloseSelf(data: { errMsg: string }) {
        try {
            this.app.logger(loggerLevel.error, "mydog_monitor_close_self : " + data.errMsg);
            setImmediate(() => {
                throw new Error("mydog_monitor_close_self : " + data.errMsg);
            });

            let exitFunc = this.app.someconfig.onBeforeExit;
            if (exitFunc) {
                await Promise.race([delayMs(30 * 1000), exitFunc()]);
            }
        } finally {
            setTimeout(() => {
                process.exit();
            }, 1000)
        }
    }

    syncAllServers(data: monitor_syncAllServers) {
        this.serversIdMap = data.
    }

    updateServers(data: monitor_updateServers) {

    }

}