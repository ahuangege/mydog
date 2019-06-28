import Application from "../application";
import tcpServer from "../components/tcpServer";
import { SocketProxy, I_clientManager, I_clientSocket } from "../util/interfaceDefine";
import { Session } from "../components/session";
import * as define from "../util/define";

/**
 * connector  tcp
 */
export class ConnectorTcp {
    public app: Application;
    public clientManager: I_clientManager = null as any;
    public handshakeBuf: Buffer;        // 握手buffer
    public heartbeatBuf: Buffer;        // 心跳回应buffer
    public heartbeatTime: number = 0;   // 心跳时间
    constructor(info: { app: Application, clientManager: I_clientManager, config: { "route": string[], "heartbeat": number, "maxLen": number }, startCb: () => void }) {
        this.app = info.app;
        this.clientManager = info.clientManager;
        tcpServer(info.app.clientPort, info.config.maxLen, info.startCb, this.newClientCb.bind(this));

        // 心跳时间
        this.heartbeatTime = info.config.heartbeat * 1000;

        // 握手buffer
        let routeBuf = Buffer.from(JSON.stringify({ "route": info.config.route, "heartbeat": this.heartbeatTime / 1000 }));
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
        new ClientSocket(this, this.clientManager, socket);
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
    constructor(connector: ConnectorTcp, clientManager: I_clientManager, socket: SocketProxy) {
        this.connector = connector;
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
        clearTimeout(this.registerTimer);
        clearTimeout(this.heartbeatTimer);
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
        this.socket.send(msg);
    }

    /**
     * 关闭
     */
    close() {
        this.socket.close();
    }
}
