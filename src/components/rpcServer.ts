import Application from "..//application";
import tcpServer from "../components/tcpServer";
import { SocketProxy, loggerLevel } from "../util/interfaceDefine";
import * as define from "../util/define";
import * as rpcService from "./rpcService";
import * as path from "path";
let meFilename = `[${path.basename(__filename, ".js")}.ts]`;

let serverToken: string = "";
let maxLen = 0;

export function start(app: Application, cb: () => void) {
    let rpcConfig = app.someconfig.rpc || {};
    maxLen = rpcConfig.maxLen || define.some_config.SocketBufferMaxLen
    let noDelay = rpcConfig.noDelay === false ? false : true;
    tcpServer(app.serverInfo.port, noDelay, startCb, newClientCb);

    function startCb() {
        let str = `listening at [${app.serverInfo.host}:${app.serverInfo.port}]  ${app.serverId}`;
        console.log(str);
        cb();
    }

    function newClientCb(socket: SocketProxy) {
        new RpcServerSocket(app, socket);
    }

    let tokenConfig = app.someconfig.recognizeToken || {};
    serverToken = tokenConfig.serverToken || define.some_config.Server_Token;
}

class RpcServerSocket {
    private app: Application;
    private socket: SocketProxy;
    private id: string = "";
    private registered: boolean = false;
    private registerTimer: NodeJS.Timeout = null as any;
    private heartbeatTimer: NodeJS.Timeout = null as any;
    private sendCache: boolean = false;
    private sendArr: Buffer[] = [];
    private sendTimer: NodeJS.Timer = null as any;
    private nowLen = 0;
    private maxLen = +Infinity;

    constructor(app: Application, socket: SocketProxy) {
        this.app = app;
        this.socket = socket;
        socket.once("data", this.onRegisterData.bind(this));
        socket.on("close", this.onClose.bind(this));
        this.registerTimer = setTimeout(function () {
            app.logger(loggerLevel.error, `${meFilename} register timeout, close the rpc socket: ${socket.remoteAddress}`);
            socket.close();
        }, 5000);
    }

    // The first message is registration
    private onRegisterData(data: Buffer) {
        try {
            let type = data.readUInt8(0);
            if (type === define.Rpc_Msg.register) {
                this.registerHandle(data);
            } else {
                this.app.logger(loggerLevel.error, `${meFilename} illegal rpc register, close the rpc socket: ${this.socket.remoteAddress}`);
                this.socket.close();
            }
        } catch (e: any) {
            this.socket.close();
            this.app.logger(loggerLevel.error, e);
        }
    }

    /**
     * socket received data
     * @param data
     */
    private onData(data: Buffer) {
        try {
            let type = data.readUInt8(0);
            if (type === define.Rpc_Msg.clientMsgIn) {
                this.app.backendServer.handleMsg(this.id, data);
            }
            else if (type === define.Rpc_Msg.clientMsgOut) {
                this.app.frontendServer.sendMsgByUids(data);
            }
            else if (type === define.Rpc_Msg.rpcMsgAwait) {
                rpcService.handleMsgAwait(this.id, data);
            }
            else if (type === define.Rpc_Msg.rpcMsg) {
                rpcService.handleMsg(this.id, data);
            }
            else if (type === define.Rpc_Msg.applySession) {
                this.app.frontendServer.applySession(data);
            }
            else if (type === define.Rpc_Msg.heartbeat) {
                this.heartbeatHandle();
                this.heartbeatResponse();
            }
            else {
                this.app.logger(loggerLevel.error, `${meFilename} illegal data type, close rpc client named: ${this.id}`);
                this.socket.close();
            }
        } catch (e: any) {
            this.app.logger(loggerLevel.error, e.stack);
        }
    }

    /**
     * The socket connection is closed
     */
    private onClose() {
        clearTimeout(this.registerTimer);
        clearTimeout(this.heartbeatTimer);
        this.heartbeatTimer = null as any;
        clearInterval(this.sendTimer);
        this.sendArr = [];
        this.nowLen = 0;
        if (this.registered) {
            this.app.rpcPool.removeSocket(this.id);
        }
        this.app.logger(loggerLevel.error, `${meFilename} a rpc client disconnected: ${this.id}, ${this.socket.remoteAddress}`);
    }

    /**
     * register
     */
    private registerHandle(msg: Buffer) {
        clearTimeout(this.registerTimer);
        let data: { "id": string, "serverType": string, "serverToken": string };
        try {
            data = JSON.parse(msg.slice(1).toString());
        } catch (err) {
            this.app.logger(loggerLevel.error, `${meFilename} JSON parse error，close the rpc socket: ${this.socket.remoteAddress}`);
            this.socket.close();
            return;
        }

        if (data.serverToken !== serverToken) {
            this.app.logger(loggerLevel.error, `${meFilename} illegal serverToken, close the rpc socket: ${this.socket.remoteAddress}`);
            this.socket.close();
            return;
        }
        if (this.app.rpcPool.getSocket(data.id)) {
            this.app.logger(loggerLevel.error, `${meFilename} already has a rpc client named: ${data.id}, close it, ${this.socket.remoteAddress}`);
            this.socket.close();
            return;
        }
        if (this.app.serverId <= data.id) {
            this.socket.close();
            return;
        }
        this.registered = true;
        this.socket.maxLen = maxLen;
        this.socket.on("data", this.onData.bind(this));

        this.id = data.id;

        this.app.logger(loggerLevel.debug, `${meFilename} get new rpc client named: ${this.id}`);

        // Determine whether to send messages regularly
        let rpcConfig = this.app.someconfig.rpc || {};
        let interval = 0;
        if (rpcConfig.interval) {
            if (typeof rpcConfig.interval === "number") {
                interval = rpcConfig.interval;
            } else {
                interval = rpcConfig.interval[data.serverType] || rpcConfig.interval.default || 0;
            }
        }
        if (interval >= 10) {
            this.sendCache = true;
            this.sendTimer = setInterval(this.sendInterval.bind(this), interval);
            let tmpMaxLen = parseInt(rpcConfig.intervalCacheLen as any) || 0;
            if (tmpMaxLen > 0) {
                this.maxLen = tmpMaxLen;
            }
        }

        // Registration is successful, respond
        let buffer = Buffer.allocUnsafe(5);
        buffer.writeUInt32BE(1, 0);
        buffer.writeUInt8(define.Rpc_Msg.register, 4);
        this.socket.send(buffer);
        this.heartbeatHandle();

        this.app.rpcPool.addSocket(this.id, this);
    }

    /**
     * Heartbeat
     */
    private heartbeatHandle() {
        if (this.heartbeatTimer) {
            this.heartbeatTimer.refresh();
            return;
        }

        let rpcConfig = this.app.someconfig.rpc || {};
        let heartbeat = rpcConfig.heartbeat || define.some_config.Time.Rpc_Heart_Beat_Time;
        if (heartbeat < 5) {
            heartbeat = 5;
        }
        this.heartbeatTimer = setTimeout(() => {
            this.app.logger(loggerLevel.error, `${meFilename} heartBeat time out, close it: ${this.id}`);
            this.socket.close();
        }, heartbeat * 1000 * 2);
    }

    /**
     * Heartbeat response
     */
    private heartbeatResponse() {
        let buffer = Buffer.allocUnsafe(5);
        buffer.writeUInt32BE(1, 0);
        buffer.writeUInt8(define.Rpc_Msg.heartbeat, 4);
        this.socket.send(buffer);
    }

    send(data: Buffer) {
        if (this.sendCache) {
            this.sendArr.push(data);
            this.nowLen += data.length;
            if (this.nowLen > this.maxLen) {
                this.sendInterval();
            }
        } else {
            this.socket.send(data);
        }
    }

    private sendInterval() {
        if (this.sendArr.length > 0) {
            this.socket.send(Buffer.concat(this.sendArr));
            this.sendArr.length = 0;
            this.nowLen = 0;
        }
    }
}