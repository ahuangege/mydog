import Application from "../application";
import { SocketProxy, ServerInfo, loggerType } from "../util/interfaceDefine";
import { TcpClient } from "../components/tcpClient";
import * as define from "../util/define";
import * as rpcService from "./rpcService";
import { concatStr } from "../util/appUtil";

/**
 * 是否建立socket连接
 */
export function ifCreateRpcClient(app: Application, server: ServerInfo) {
    // 两个服务器之间，只建立一个socket连接
    if (app.serverId < server.id) {
        removeSocket(server.id);
        new RpcClientSocket(app, server);
    }
}

/**
 * 移除socket连接
 */
export function removeSocket(id: string) {
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
    private host: string;
    private port: number;
    private socket: SocketProxy = null as any;
    private connectTimer: NodeJS.Timer = null as any;
    private heartbeatTimer: NodeJS.Timer = null as any;
    private heartbeatTimeoutTimer: NodeJS.Timer = null as any;
    private die: boolean = false;

    constructor(app: Application, server: ServerInfo) {
        this.app = app;
        this.id = server.id;
        this.host = server.host;
        this.port = server.port;
        rpcClientSockets[this.id] = this;
        this.doConnect(0);
    }

    private doConnect(delay: number) {
        if (this.die) {
            return;
        }
        let self = this;
        this.connectTimer = setTimeout(() => {
            let connectCb = function () {
                self.app.logger(loggerType.info, concatStr("connect to rpc server ", self.id, " success"));

                // 注册
                let registerBuf = Buffer.from(JSON.stringify({
                    "id": self.app.serverId,
                    "serverToken": self.app.serverToken
                }));
                let buf = Buffer.allocUnsafe(registerBuf.length + 5);
                buf.writeUInt32BE(registerBuf.length + 1, 0);
                buf.writeUInt8(define.Rpc_Msg.register, 4);
                registerBuf.copy(buf, 5);
                self.socket.send(buf);

            };
            self.connectTimer = null as any;
            self.socket = new TcpClient(self.port, self.host, self.app.rpcConfig.maxLen || define.some_config.SocketBufferMaxLen, connectCb);
            self.socket.on("data", self.onData.bind(self));
            self.socket.on("close", self.onClose.bind(self));
            self.app.logger(loggerType.info, concatStr("try to connect to rpc server ", self.id));
        }, delay);
    }


    private onClose() {
        this.app.rpcPool.removeSocket(this.id);
        clearTimeout(this.heartbeatTimer);
        clearTimeout(this.heartbeatTimeoutTimer);
        this.heartbeatTimeoutTimer = null as any;
        this.socket = null as any;
        this.app.logger(loggerType.error, concatStr("socket closed, reconnect the rpc server ", this.id, " later"));
        this.doConnect(define.some_config.Time.Rpc_Reconnect_Time * 1000);
    }

    /**
     * 每隔一定时间发送心跳
     */
    private heartbeatSend() {
        let self = this;
        let timeDelay = define.some_config.Time.Rpc_Heart_Beat_Time * 1000 - 5000 + Math.floor(5000 * Math.random());
        this.heartbeatTimer = setTimeout(function () {
            let buf = Buffer.allocUnsafe(5);
            buf.writeUInt32BE(1, 0);
            buf.writeUInt8(define.Rpc_Msg.heartbeat, 4);
            self.socket.send(buf);
            self.heartbeatTimeoutStart();
            self.heartbeatSend();
        }, timeDelay);
    }

    /**
     * 发送心跳后，收到回应
     */
    private heartbeatResponse() {
        clearTimeout(this.heartbeatTimeoutTimer);
        this.heartbeatTimeoutTimer = null as any;
    }

    /**
     * 发送心跳后，一定时间内必须收到回应，否则断开连接
     */
    private heartbeatTimeoutStart() {
        if (this.heartbeatTimeoutTimer !== null) {
            return;
        }
        let self = this;
        this.heartbeatTimeoutTimer = setTimeout(function () {
            self.app.logger(loggerType.error, concatStr("heartbeat timeout, close the rpc socket " + self.id));
            self.socket.close();
        }, define.some_config.Time.Rpc_Heart_Beat_Timeout_Time * 1000)

    }

    private onData(data: Buffer) {
        try {
            let type = data.readUInt8(0);
            if (type === define.Rpc_Msg.clientMsgIn) {
                this.app.backendServer.handleMsg(this.id, data);
            }
            else if (type === define.Rpc_Msg.clientMsgOut) {
                this.app.frontendServer.sendMsgByUids(data);
            }
            else if (type === define.Rpc_Msg.rpcMsg) {
                rpcService.handleMsg(this.id, data);
            }
            else if (type === define.Rpc_Msg.applySession) {
                this.app.frontendServer.applySession(data);
            }
            else if (type === define.Rpc_Msg.register) {
                this.registerHandle();
            }
            else if (type === define.Rpc_Msg.heartbeat) {
                this.heartbeatResponse();
            }
        } catch (e) {
            this.app.logger(loggerType.error, e.stack);
        }
    }

    /**
     * 注册成功
     */
    private registerHandle() {
        this.heartbeatSend();
        this.app.rpcPool.addSocket(this.id, this.socket);
    }

    /**
     * 移除该socket
     */
    remove() {
        this.die = true;
        if (this.socket) {
            this.socket.close();
        } else if (this.connectTimer !== null) {
            clearTimeout(this.connectTimer);
        }
    }
}