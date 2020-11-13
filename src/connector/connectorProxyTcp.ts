import Application from "../application";
import tcpServer from "../components/tcpServer";
import { I_clientManager, I_clientSocket, SocketProxy } from "../util/interfaceDefine";
import * as define from "../util/define";
import { I_connectorConfig } from "../..";
import { Session } from "../components/session";

let maxLen = 0;
/**
 * connector  tcp
 */
export class ConnectorTcp {
    public app: Application;
    public clientManager: I_clientManager = null as any;
    public handshakeBuf: Buffer;        // 握手buffer
    public heartbeatBuf: Buffer;        // 心跳回应buffer
    public heartbeatTime: number = 0;   // 心跳时间
    private maxConnectionNum: number = Number.POSITIVE_INFINITY;
    public nowConnectionNum: number = 0;
    public sendCache = false;
    public interval: number = 0;

    constructor(info: { app: Application, clientManager: I_clientManager, config: I_connectorConfig, startCb: () => void }) {
        this.app = info.app;
        this.clientManager = info.clientManager;

        let connectorConfig = info.config || {};
        maxLen = connectorConfig.maxLen || define.some_config.SocketBufferMaxLen;
        let noDelay = connectorConfig.noDelay === false ? false : true;
        this.heartbeatTime = (connectorConfig.heartbeat || 0) * 1000;
        if (connectorConfig.maxConnectionNum != null) {
            this.maxConnectionNum = connectorConfig.maxConnectionNum;
        }
        let interval = Number(connectorConfig.interval) || 0;
        if (interval >= 10) {
            this.sendCache = true;
            this.interval = interval;
        }

        tcpServer(info.app.clientPort, noDelay, info.startCb, this.newClientCb.bind(this));


        // 握手buffer
        let routeBuf = Buffer.from(JSON.stringify({ "route": this.app.routeConfig, "heartbeat": this.heartbeatTime / 1000 }));
        this.handshakeBuf = Buffer.alloc(routeBuf.length + 5);
        this.handshakeBuf.writeUInt32BE(routeBuf.length + 1, 0);
        this.handshakeBuf.writeUInt8(define.Server_To_Client.handshake, 4);
        routeBuf.copy(this.handshakeBuf, 5);

        // 心跳回应buffer
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
    private connector: ConnectorTcp;
    private clientManager: I_clientManager;
    private handshakeOver: boolean = false;                 // 是否已经握手成功
    private socket: SocketProxy;                            // socket
    private registerTimer: NodeJS.Timer = null as any;      // 握手超时计时
    private heartbeatTimer: NodeJS.Timer = null as any;     // 心跳超时计时
    private sendCache = false;
    private interval: number = 0;
    private sendTimer: NodeJS.Timer = null as any;
    private sendArr: Buffer[] = [];

    constructor(connector: ConnectorTcp, clientManager: I_clientManager, socket: SocketProxy) {
        this.connector = connector;
        this.connector.nowConnectionNum++;
        this.sendCache = connector.sendCache;
        this.interval = connector.interval;
        this.clientManager = clientManager;
        this.socket = socket;
        this.remoteAddress = socket.remoteAddress;
        this.socket.maxLen = 5;   // 未注册时最多5字节数据
        socket.once('data', this.onRegister.bind(this));
        socket.on('close', this.onClose.bind(this));
        this.registerTimer = setTimeout(() => {
            this.close();
        }, 10000);
    }

    private onRegister(data: Buffer) {
        let type = data.readUInt8(0);
        if (type === define.Client_To_Server.handshake) {        // 握手
            this.handshake();
        } else {
            this.close();
        }
    }

    /**
     * 收到数据
     */
    private onData(data: Buffer) {
        let type = data.readUInt8(0);
        if (type === define.Client_To_Server.msg) {               // 普通的自定义消息
            this.clientManager.handleMsg(this, data);
        } else if (type === define.Client_To_Server.heartbeat) {        // 心跳
            this.heartbeat();
            this.heartbeatResponse();
        } else {
            this.close();
        }
    }

    /**
     * 关闭了
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
     * 握手
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
        this.socket.maxLen = maxLen;
        this.socket.on('data', this.onData.bind(this));
    }

    /**
     * 心跳
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
     * 心跳回应
     */
    private heartbeatResponse() {
        this.send(this.connector.heartbeatBuf);
    }

    /**
     * 发送数据
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
            let arr = this.sendArr;
            let i: number;
            let len = arr.length;
            for (i = 0; i < len; i++) {
                this.socket.send(arr[i]);
            }
            this.sendArr = [];
        }
    }

    /**
     * 关闭
     */
    close() {
        this.socket.close();
    }
}
