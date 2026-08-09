import Application from "../application";
import { I_clientManager, I_clientSocket, SocketProxy, I_connectorConfig } from "../util/interfaceDefine";
import * as define from "../util/define";
import { Session } from "../components/session";
import { EventEmitter } from "events";
import WebSocket, * as ws from "ws";
import * as https from "https";
import * as http from "http";
import { some_config } from "../util/define";
import * as crypto from "crypto";

let maxLen = 0;
/**
 * connector  ws
 */
export class ConnectorWs {
    public app: Application;
    public clientManager: I_clientManager = null as any;
    public handshakeBuf: Buffer;        // Handshake buffer
    public handshakeBufAll: Buffer = null as any;        // Handshake buffer all
    public heartbeatBuf: Buffer;        // Heartbeat response buffer
    public heartbeatTime: number = 0;   // Heartbeat time
    private maxConnectionNum: number = Number.POSITIVE_INFINITY;
    public nowConnectionNum: number = 0;
    public interval: number = 0;
    public intervalCacheLen = +Infinity;

    public md5 = "";    // route array md5

    constructor(info: { app: Application, clientManager: I_clientManager, config: I_connectorConfig, startCb: () => void }) {
        this.app = info.app;
        this.clientManager = info.clientManager;

        let connectorConfig = info.config || {};
        maxLen = connectorConfig.maxLen || define.some_config.SocketBufferMaxLen;
        this.heartbeatTime = (connectorConfig.heartbeat || 0) * 1000;
        if (connectorConfig.maxConnectionNum != null) {
            this.maxConnectionNum = connectorConfig.maxConnectionNum;
        }
        let interval = Number(connectorConfig.interval) || define.some_config.msgFlushInterval;
        if (interval < 16) {
            interval = 16;
        }
        this.interval = interval;

        let tmpMaxLen = Number(connectorConfig.intervalCacheLen) || 0;
        if (tmpMaxLen > 0) {
            this.intervalCacheLen = tmpMaxLen;
        } else {
            this.intervalCacheLen = define.some_config.intervalCacheLen;
        }

        wsServer(info.app.serverInfo.clientPort, connectorConfig, info.startCb, this.newClientCb.bind(this));

        // Handshake buffer
        let cipher = crypto.createHash("md5")
        this.md5 = cipher.update(JSON.stringify(this.app.routeConfig)).digest("hex");

        let routeBuf = Buffer.from(JSON.stringify({ "md5": this.md5, "heartbeat": this.heartbeatTime / 1000 }));
        this.handshakeBuf = Buffer.allocUnsafeSlow(routeBuf.length + 5);
        this.handshakeBuf.writeUInt32BE(routeBuf.length + 1, 0);
        this.handshakeBuf.writeUInt8(define.Server_To_Client.handshake, 4);
        routeBuf.copy(this.handshakeBuf, 5);

        let routeBufAll = Buffer.from(JSON.stringify({ "md5": this.md5, "route": this.app.routeConfig, "heartbeat": this.heartbeatTime / 1000 }));
        this.handshakeBufAll = Buffer.allocUnsafeSlow(routeBufAll.length + 5);
        this.handshakeBufAll.writeUInt32BE(routeBufAll.length + 1, 0);
        this.handshakeBufAll.writeUInt8(define.Server_To_Client.handshake, 4);
        routeBufAll.copy(this.handshakeBufAll, 5);

        // Heartbeat response buffer
        this.heartbeatBuf = Buffer.allocUnsafeSlow(5);
        this.heartbeatBuf.writeUInt32BE(1, 0);
        this.heartbeatBuf.writeUInt8(define.Server_To_Client.heartbeatResponse, 4);
    }

    private newClientCb(socket: SocketProxy) {
        if (this.nowConnectionNum < this.maxConnectionNum) {
            new ClientSocket(this, this.clientManager, socket);
        } else {
            console.warn("socket num has reached the maxConnectionNum, close it");
            socket.close();
        }
    }
}

class ClientSocket implements I_clientSocket {
    session: Session = null as any;                         // Session
    remoteAddress: string = "";
    private connector: ConnectorWs;
    private clientManager: I_clientManager;
    private socket: SocketProxy;                            // socket
    private registerTimer: NodeJS.Timer = null as any;      // Handshake timeout timer
    private heartbeatTimer: NodeJS.Timer = null as any;     // Heartbeat timeout timer
    private interval: number = 0;
    private sendTimer: NodeJS.Timer = null as any;
    private sendArr: Buffer[] = [];
    private intervalCacheLen = 0;
    private nowLen = 0;

    constructor(connector: ConnectorWs, clientManager: I_clientManager, socket: SocketProxy) {
        this.connector = connector;
        this.connector.nowConnectionNum++;
        this.interval = connector.interval;
        this.intervalCacheLen = connector.intervalCacheLen;
        this.clientManager = clientManager;
        this.socket = socket;
        this.remoteAddress = socket.remoteAddress;
        if (this.socket.socket._receiver) {
            this.socket.socket._receiver._maxPayload = 50;   // Up to 50 byte of data when not registered
        }
        socket.once('data', this.onRegister.bind(this));
        socket.on('close', this.onClose.bind(this));
        this.registerTimer = setTimeout(() => {
            this.close();
        }, 10000);
    }

    private onRegister(data: Buffer) {
        let type = data.readUInt8(0);
        if (type === define.Client_To_Server.handshake) {        // shake hands
            this.handshake(data);
        } else {
            this.close();
        }
    }

    /**
     * Received data
     */
    private onData(data: Buffer) {
        let type = data.readUInt8(0);
        if (type === define.Client_To_Server.msg) {               // Ordinary custom message
            this.clientManager.handleMsg(this, data);
        } else if (type === define.Client_To_Server.heartbeat) {        // Heartbeat
            this.heartbeat();
            this.heartbeatResponse();
        } else {
            this.close();
        }
    }

    /**
     * closed
     */
    private onClose() {
        this.connector.nowConnectionNum--;
        clearTimeout(this.registerTimer);
        clearTimeout(this.heartbeatTimer);
        this.heartbeatTimer = null as any;
        clearInterval(this.sendTimer);
        this.sendArr = [];
        this.nowLen = 0;
        this.clientManager.removeClient(this);
    }

    /**
     * shake hands
     */
    private handshake(data: Buffer) {
        let msg: { "md5": string } = null as any;
        try {
            msg = JSON.parse(data.slice(1).toString());
        } catch (e) {
        }
        if (!msg) {
            this.close();
            return;
        }
        if (msg.md5 === this.connector.md5) {
            this.send(this.connector.handshakeBuf);
        } else {
            this.send(this.connector.handshakeBufAll);
        }

        clearTimeout(this.registerTimer);
        this.heartbeat();
        this.sendTimer = setInterval(this.sendInterval.bind(this), this.interval);

        if (this.socket.socket._receiver) {
            this.socket.socket._receiver._maxPayload = maxLen;
        }
        this.socket.on('data', this.onData.bind(this));
        this.clientManager.addClient(this);
    }

    /**
     * Heartbeat
     */
    private heartbeat() {
        if (this.connector.heartbeatTime === 0) {
            return;
        }
        if (this.heartbeatTimer) {
            this.heartbeatTimer.refresh();
        } else {
            this.heartbeatTimer = setTimeout(() => {
                this.close();
            }, this.connector.heartbeatTime * 2);
        }
    }

    /**
     * Heartbeat response
     */
    private heartbeatResponse() {
        this.send(this.connector.heartbeatBuf);
    }

    /**
     * send data
     */
    send(msg: Buffer, msg2?: Buffer) {
        this.sendArr.push(msg);
        this.nowLen += msg.length;

        if (msg2) {
            this.sendArr.push(msg2);
            this.nowLen += msg2.length;

        }

        if (this.nowLen > this.intervalCacheLen) {
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

    /**
     * close
     */
    close() {
        this.sendInterval();
        this.socket.close();
    }
}











/**
 * websocket server
 */
function wsServer(port: number, config: I_connectorConfig, startCb: () => void, newClientCb: (socket: SocketProxy) => void) {
    let httpServer = config["ssl"] ? https.createServer({ "cert": config["cert"], "key": config["key"] }) : http.createServer();
    let server = new ws.Server({ "server": httpServer });
    server.on("connection", function (socket, req) {
        newClientCb(new WsSocket(socket, req.connection.remoteAddress as string));
    });
    server.on("error", (err) => {
        console.log(err);
        process.exit();
    });
    server.on("close", () => { });
    httpServer.listen(port, startCb);
}

class WsSocket extends EventEmitter implements SocketProxy {
    die: boolean = false;
    remoteAddress: string = "";
    socket: WebSocket;
    maxLen: number = 0;
    len: number = 0;
    buffer: Buffer = null as any;
    headLen = 0;
    headBuf = Buffer.allocUnsafeSlow(4);
    private onDataFunc: (data: Buffer) => void = null as any;
    constructor(socket: WebSocket, remoteAddress: string) {
        super();
        this.socket = socket;
        this.remoteAddress = remoteAddress;

        socket.on("close", () => {
            this.onClose();
        });
        socket.on("error", (err: any) => {
            this.onClose(err);
        });

        this.onDataFunc = this.onData.bind(this);
        socket.on("message", this.onDataFunc);
    }

    private onClose(err?: Error) {
        if (!this.die) {
            this.die = true;
            this.socket.off("message", this.onDataFunc);
            this.emit("close", err);
        }
    }

    private onData(data: Buffer) {
        let startIdx = 0;
        let endIdx = 0;
        while (endIdx < data.length) {
            startIdx = endIdx + 4;
            if (data.length < startIdx) {
                this.close();
                return;
            }
            endIdx = startIdx + data.readUInt32BE(endIdx);
            if (data.length < endIdx) {
                this.close();
                return;
            }
            this.emit("data", data.slice(startIdx, endIdx));
        }
    }

    send(data: Buffer) {
        this.socket.send(data);
    }

    close() {
        this.socket.close();
        this.onClose();
    }
}

