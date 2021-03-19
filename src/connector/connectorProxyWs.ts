import Application from "../application";
import { I_clientManager, I_clientSocket, SocketProxy } from "../util/interfaceDefine";
import * as define from "../util/define";
import { I_connectorConfig } from "../..";
import { Session } from "../components/session";
import { EventEmitter } from "events";
import * as ws from "ws";
import { some_config } from "../util/define";


let maxLen = 0;
/**
 * connector  ws
 */
export class ConnectorWs {
    public app: Application;
    public clientManager: I_clientManager = null as any;
    public handshakeBuf: Buffer;        // Handshake buffer
    public heartbeatBuf: Buffer;        // Heartbeat response buffer
    public heartbeatTime: number = 0;   // Heartbeat time
    private maxConnectionNum: number = Number.POSITIVE_INFINITY;
    public nowConnectionNum: number = 0;
    public sendCache = false;
    public interval: number = 0;

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

        wsServer(info.app.serverInfo.clientPort, info.startCb, this.newClientCb.bind(this));

        // Handshake buffer
        let routeBuf = Buffer.from(JSON.stringify({ "route": this.app.routeConfig, "heartbeat": this.heartbeatTime / 1000 }));
        this.handshakeBuf = Buffer.alloc(routeBuf.length + 1);
        this.handshakeBuf.writeUInt8(define.Server_To_Client.handshake, 0);
        routeBuf.copy(this.handshakeBuf, 1);

        // Heartbeat response buffer
        this.heartbeatBuf = Buffer.alloc(1);
        this.heartbeatBuf.writeUInt8(define.Server_To_Client.heartbeatResponse, 0);
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
    private handshakeOver: boolean = false;                 // Whether the handshake has been successful
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
        this.socket.socket._receiver._maxPayload = 1;   // Up to 1 byte of data when not registered
        socket.once('data', this.onRegister.bind(this));
        socket.on('close', this.onClose.bind(this));
        this.registerTimer = setTimeout(() => {
            this.close();
        }, 10000);
    }

    private onRegister(data: Buffer) {
        let type = data.readUInt8(0);
        if (type === define.Client_To_Server.handshake) {        // shake hands
            this.handshake();
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
        clearInterval(this.sendTimer);
        this.sendArr = [];
        this.clientManager.removeClient(this);
    }

    /**
     * shake hands
     */
    private handshake() {
        if (this.handshakeOver) {
            this.close();
            return;
        }
        this.handshakeOver = true;
        this.send(this.connector.handshakeBuf);
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
        clearTimeout(this.heartbeatTimer);
        this.heartbeatTimer = setTimeout(() => {
            this.close();
        }, this.connector.heartbeatTime * 2);
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
        this.socket.close();
    }
}











/**
 * websocket server
 */
function wsServer(port: number, startCb: () => void, newClientCb: (socket: SocketProxy) => void) {
    let server = new ws.Server({ "port": port, "maxPayload": some_config.SocketBufferMaxLenUnregister }, startCb);
    server.on("connection", function (socket, req) {
        newClientCb(new WsSocket(socket, req.connection.remoteAddress as string));
    });
    server.on("error", (err) => {
        console.log(err);
        process.exit();
    });
    server.on("close", () => { });
}

class WsSocket extends EventEmitter implements SocketProxy {
    die: boolean = false;
    remoteAddress: string = "";
    socket: any;
    maxLen: number = 0;
    len: number = 0;
    buffer: Buffer = Buffer.allocUnsafe(0);
    constructor(socket: any, remoteAddress: string) {
        super();
        this.socket = socket;
        this.remoteAddress = remoteAddress;
        socket.on("close", (err: any) => {
            if (!this.die) {
                this.die = true;
                this.emit("close", err);
            }
        });
        socket.on("error", (err: any) => {
            if (!this.die) {
                this.die = true;
                this.emit("close", err);
            }
        });
        socket.on("message", (data: Buffer) => {
            if (!this.die) {
                this.emit("data", data);
            } else {
                this.close()
            }
        });
    }

    send(data: Buffer) {
        this.socket.send(data);
    }

    close() {
        this.socket.close();
        this.socket.emit("close");
    }
}