import Application from "../application";
import { SocketProxy, loggerLevel, ServerInfo } from "../util/interfaceDefine";
import { TcpClient } from "../components/tcpClient";
import * as define from "../util/define";
import * as rpcService from "./rpcService";
import * as appUtil from "../util/appUtil";
import * as path from "path";
import { ExecLineUpUtil } from "../util/execLineUpUtil";
import { randBetweenInt } from "../util/starter";
let meFilename = `[${path.basename(__filename, ".js")}.ts]`;


let lineUpUtil: ExecLineUpUtil = null as any; // socket 建立排队

/**
 * Whether to establish a socket connection
 */
export function addRpcClient(app: Application, server: ServerInfo) {
    if (app.serverId === server.id) {
        return;
    }
    if (!lineUpUtil) {
        let rpcConfig = app.someconfig.rpc || {};
        const socketPerSecond = Math.floor(rpcConfig.socketPerSecond) || 20;
        lineUpUtil = new ExecLineUpUtil(socketPerSecond);
    }

    // Only one socket connection is established between the two servers
    if (app.serverId < server.id && !app.noRpcMatrix[appUtil.getNoRpcKey(app.serverType, server.serverType)]) {
        const oldSocket = rpcClientSockets[server.id]
        if (oldSocket && oldSocket.host === server.host && oldSocket.port === server.port) {
            return;
        }

        removeRpcClient(server.id);
        new RpcClientSocket(app, server);
    }
}

/**
 * Remove socket connection
 */
export function removeRpcClient(id: string) {
    let socket = rpcClientSockets[id];
    if (socket) {
        socket.remove();
        delete rpcClientSockets[id];
    }
}

let rpcClientSockets: { [id: string]: RpcClientSocket } = {};

export class RpcClientSocket {
    private app: Application;
    public id: string;
    host: string;
    port: number;
    private socket: SocketProxy = null as any;
    private connectTimer: NodeJS.Timer = null as any;
    private heartbeatTimer: NodeJS.Timer = null as any;
    private heartbeatTimeoutTimer: NodeJS.Timer = null as any;
    private interval: number = 0;
    private sendArr: Buffer[] = [];
    private sendTimer: NodeJS.Timer = null as any;
    private nowLen = 0;
    private maxLen = +Infinity;
    private die: boolean = false;
    private serverToken: string = "";
    private lineUpCb: () => void = null as any;
    private reconnectCnt = 0;


    constructor(app: Application, server: ServerInfo) {
        this.app = app;
        this.id = server.id;
        this.host = server.host;
        this.port = server.port;
        rpcClientSockets[this.id] = this;
        let rpcConfig = app.someconfig.rpc || {};
        let interval = 0;
        if (rpcConfig.interval) {
            if (typeof rpcConfig.interval === "number") {
                interval = rpcConfig.interval;
            } else {
                interval = rpcConfig.interval[server.serverType] || rpcConfig.interval.default || 0;
            }
        }
        interval = interval || define.some_config.msgFlushInterval;
        if (interval < 16) {
            interval = 16;
        }
        this.interval = interval;
        let tmpMaxLen = Math.floor(rpcConfig.intervalCacheLen) || 0;
        if (tmpMaxLen > 0) {
            this.maxLen = tmpMaxLen;
        } else {
            this.maxLen = define.some_config.intervalCacheLen;
        }

        let tokenConfig = app.someconfig.recognizeToken || {};
        this.serverToken = tokenConfig.serverToken || define.some_config.Server_Token;

        const rand = randBetweenInt(200, 1000);
        this.doConnect(rand);
    }

    private doConnect(delay: number) {
        if (this.die) {
            return;
        }

        this.connectTimer = setTimeout(() => {
            this.connectTimer = null as any;

            if (this.die) {
                return;
            }

            // 排队，防止 socket 建立风暴
            this.lineUpCb = this.connectFunc.bind(this);
            lineUpUtil.lineUp(this.lineUpCb);
        }, delay);
    }

    private connectFunc() {
        if (this.die) {
            return;
        }
        const self = this;
        let connectCb = function () {
            self.app.logger(loggerLevel.debug, `${meFilename} connect to rpc server success: ${self.id}`);
            self.reconnectCnt = 0;

            // register
            let registerBuf = Buffer.from(JSON.stringify({
                "id": self.app.serverId,
                "serverType": self.app.serverType,
                "serverToken": self.serverToken
            }));
            let buf = Buffer.allocUnsafe(registerBuf.length + 5);
            buf.writeUInt32BE(registerBuf.length + 1, 0);
            buf.writeUInt8(define.Rpc_Msg.register, 4);
            registerBuf.copy(buf, 5);
            self.socket.send(buf);
            self.sendTimer = setInterval(self.sendInterval.bind(self), self.interval);

        };
        let rpcConfig = self.app.someconfig.rpc || {};
        let noDelay = rpcConfig.noDelay === false ? false : true;
        self.socket = new TcpClient(self.port, self.host, rpcConfig.maxLen || define.some_config.SocketBufferMaxLen, noDelay, connectCb);
        self.socket.on("data", self.onData.bind(self));
        self.socket.on("close", self.onClose.bind(self));
        self.app.logger(loggerLevel.debug, `${meFilename} try to connect to rpc server: ${self.id}`);
    }


    private onClose() {
        this.app.rpcPool.removeSocket(this.id);
        clearTimeout(this.heartbeatTimer);
        clearTimeout(this.heartbeatTimeoutTimer);
        clearTimeout(this.connectTimer);
        clearInterval(this.sendTimer);
        this.sendArr = [];
        this.nowLen = 0;
        this.heartbeatTimeoutTimer = null as any;
        this.socket = null as any;
        lineUpUtil.remove(this.lineUpCb);
        this.lineUpCb = null as any;

        this.app.logger(loggerLevel.error, `${meFilename} socket closed, reconnect the rpc server later: ${this.id}`);

        let delayMs = define.some_config.Time.Rpc_Reconnect_Time * 1000 * Math.pow(2, this.reconnectCnt); // 指数退避
        const rand = 0.7 + Math.random() * 0.4;
        delayMs = Math.floor(delayMs * rand); // 随机抖动
        delayMs = Math.min(delayMs, 30 * 1000); // 封顶

        this.reconnectCnt++;
        this.doConnect(delayMs);
    }

    /**
     * Send heartbeat at regular intervals
     */
    private heartbeatSend() {
        let rpcConfig = this.app.someconfig.rpc || {};
        let heartbeat = rpcConfig.heartbeat || define.some_config.Time.Rpc_Heart_Beat_Time;
        let timeDelay = heartbeat * 1000 - 5000 + Math.floor(5000 * Math.random());
        if (timeDelay < 5000) {
            timeDelay = 5000;
        }
        this.heartbeatTimer = setTimeout(() => {

            let buf = Buffer.allocUnsafe(5);
            buf.writeUInt32BE(1, 0);
            buf.writeUInt8(define.Rpc_Msg.heartbeat, 4);
            this.socket.send(buf);

            this.heartbeatTimeoutStart();
            this.heartbeatSend(); // 重新随机抖动发送心跳
        }, timeDelay);
    }

    /**
     * After sending a heartbeat, receive a response
     */
    private heartbeatResponse() {
        clearTimeout(this.heartbeatTimeoutTimer);
        this.heartbeatTimeoutTimer = null as any;
    }

    /**
     * After sending the heartbeat, a response must be received within a certain period of time, otherwise the connection will be disconnected
     */
    private heartbeatTimeoutStart() {
        if (this.heartbeatTimeoutTimer !== null) {
            return;
        }
        let self = this;
        this.heartbeatTimeoutTimer = setTimeout(function () {
            self.app.logger(loggerLevel.error, `${meFilename} heartbeat timeout, close the rpc socket: ${self.id}`);
            self.socket.close();
        }, define.some_config.Time.Rpc_Heart_Beat_Timeout_Time * 1000);

    }

    private onData(data: Buffer) {
        try {
            let type = data.readUInt8(0);
            switch (type) {
                case define.Rpc_Msg.clientMsgOut:
                    this.app.frontendServer.sendMsgByUids(data);
                    break;
                case define.Rpc_Msg.clientMsgIn:
                    this.app.backendServer.handleMsg(this.id, data);
                    break;
                case define.Rpc_Msg.rpcMsgAwait:
                    rpcService.handleMsgAwait(this.id, data);
                    break;
                case define.Rpc_Msg.register:
                    this.registerHandle();
                    break;
                case define.Rpc_Msg.heartbeat:
                    this.heartbeatResponse();
                    break;
                default:
                    break;
            }
        } catch (e: any) {
            this.app.logger(loggerLevel.error, e);
        }
    }

    /**
     * registration success
     */
    private registerHandle() {
        this.heartbeatSend();
        this.app.rpcPool.addSocket(this.id, this);
    }

    /**
     * Remove the socket
     */
    remove() {
        this.die = true;
        if (this.socket) {
            this.socket.close();
        }
        if (this.connectTimer) {
            clearTimeout(this.connectTimer);
        }
        lineUpUtil.remove(this.lineUpCb);
    }

    send(data: Buffer, data2?: Buffer, data3?: Buffer) {
        this.sendArr.push(data);
        this.nowLen += data.length;

        if (data2) {
            this.sendArr.push(data2);
            this.nowLen += data2.length;
        }

        if (data3) {
            this.sendArr.push(data3);
            this.nowLen += data3.length;
        }

        if (this.nowLen > this.maxLen) {
            this.sendInterval();
        }
    }

    private sendInterval() {
        const arrLen = this.sendArr.length;
        if (arrLen > 0) {
            const endBuff = arrLen === 1 ? this.sendArr[0] : Buffer.concat(this.sendArr, this.nowLen);

            if (arrLen > 4096) {
                this.sendArr = [];        // 放弃异常膨胀的数组
            } else {
                this.sendArr.length = 0;  // 正常情况复用
            }
            this.nowLen = 0;

            this.socket.send(endBuff);
        }
    }
}