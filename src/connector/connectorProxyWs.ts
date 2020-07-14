import Application from "../application";
import { SocketProxy, I_clientManager, I_clientSocket, I_connectorConfig } from "../util/interfaceDefine";
import { Session } from "../components/session";
import * as define from "../util/define";
import wsServer from "../components/wsServer";

/**
 * connector  ws
 */
export class ConnectorWs {
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
        let maxLen = connectorConfig.maxLen || define.some_config.SocketBufferMaxLen;
        this.heartbeatTime = (connectorConfig.heartbeat || 0) * 1000;
        if (connectorConfig.maxConnectionNum != null) {
            this.maxConnectionNum = connectorConfig.maxConnectionNum;
        }
        let interval = Number(connectorConfig.interval) || 0;
        if (interval >= 10) {
            this.sendCache = true;
            this.interval = interval;
        }

        wsServer(info.app.clientPort, maxLen, info.startCb, this.newClientCb.bind(this));

        // 握手buffer
        let routeBuf = Buffer.from(JSON.stringify({ "route": this.app.routeConfig, "heartbeat": this.heartbeatTime / 1000 }));
        this.handshakeBuf = Buffer.alloc(routeBuf.length + 1);
        this.handshakeBuf.writeUInt8(define.Server_To_Client.handshake, 0);
        routeBuf.copy(this.handshakeBuf, 1);

        // 心跳回应buffer
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
    private handshakeOver: boolean = false;                 // 是否已经握手成功
    private socket: SocketProxy;                            // socket
    private registerTimer: NodeJS.Timer = null as any;      // 握手超时计时
    private heartbeatTimer: NodeJS.Timer = null as any;     // 心跳超时计时
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
        socket.on('data', this.onData.bind(this));
        socket.on('close', this.onClose.bind(this));
        this.registerTimer = setTimeout(() => {
            this.close();
        }, 10000);
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
        } else if (type === define.Client_To_Server.handshake) {        // 握手
            this.handshake();
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
            for (let i = 0, len = arr.length; i < len; i++) {
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