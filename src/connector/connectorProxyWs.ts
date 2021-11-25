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
    public sendCache = false;
    public interval: number = 0;
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
        let interval = Number(connectorConfig.interval) || 0;
        if (interval >= 10) {
            this.sendCache = true;
            this.interval = interval;
        }

        wsServer(info.app.serverInfo.clientPort, connectorConfig, info.startCb, this.newClientCb.bind(this));

        // Handshake buffer
        let cipher = crypto.createHash("md5")
        this.md5 = cipher.update(JSON.stringify(this.app.routeConfig)).digest("hex");

        let routeBuf = Buffer.from(JSON.stringify({ "md5": this.md5, "heartbeat": this.heartbeatTime / 1000 }));
        this.handshakeBuf = Buffer.alloc(routeBuf.length + 5);
        this.handshakeBuf.writeUInt32BE(routeBuf.length + 1, 0);
        this.handshakeBuf.writeUInt8(define.Server_To_Client.handshake, 4);
        routeBuf.copy(this.handshakeBuf, 5);

        let routeBufAll = Buffer.from(JSON.stringify({ "md5": this.md5, "route": this.app.routeConfig, "heartbeat": this.heartbeatTime / 1000 }));
        this.handshakeBufAll = Buffer.alloc(routeBufAll.length + 5);
        this.handshakeBufAll.writeUInt32BE(routeBufAll.length + 1, 0);
        this.handshakeBufAll.writeUInt8(define.Server_To_Client.handshake, 4);
        routeBufAll.copy(this.handshakeBufAll, 5);

        // Heartbeat response buffer
        this.heartbeatBuf = Buffer.alloc(5);
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
    private sendCache = false;
    private interval: number = 0;
    private sendTimer: NodeJS.Timer = null as any;
    private sendArr: Buffer[] = [];

    constructor(connector: ConnectorWs, clientManager: I_clientManager, socket: SocketProxy) {
        this.connector = connector;
        this.connector.nowConnectionNum++;
        this.sendCache = connector.sendCache;
        this.interval = connector.interval;
        this.clientManager = clientManager;
        this.socket = socket;
        this.remoteAddress = socket.remoteAddress;
        this.socket.socket._receiver._maxPayload = 50;   // Up to 50 byte of data when not registered
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
        this.clientManager.addClient(this);
        if (this.sendCache) {
            this.sendTimer = setInterval(this.sendInterval.bind(this), this.interval);
        }
        this.socket.socket._receiver._maxPayload = maxLen;
        this.socket.on('data', this.onData.bind(this));
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
    send(msg: Buffer) {
        if (this.sendCache) {
            this.sendArr.push(msg);
        } else {
            this.socket.send(msg);
        }
    }

    private sendInterval() {
        if (this.sendArr.length > 0) {
            this.socket.send(Buffer.concat(this.sendArr));
            this.sendArr.length = 0;
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
    headBuf = Buffer.alloc(4);
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
        let index = 0;
        while (index < data.length) {
            let msgLen = data.readUInt32BE(index);
            this.emit("data", data.slice(index + 4, index + 4 + msgLen));
            index += msgLen + 4;
        }
    }

    send(data: Buffer) {
        this.socket.send(data);
    }

    close() {
        this.socket.close();
        this.socket.emit("close");
    }
}

