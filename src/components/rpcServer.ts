import Application from "..//application";
import tcpServer from "../components/tcpServer";
import { SocketProxy, loggerType } from "../util/interfaceDefine";
import * as define from "../util/define";
import * as rpcService from "./rpcService";
import { concatStr } from "../util/appUtil";

export function start(app: Application, cb: () => void) {
    tcpServer(app.port, app.rpcConfig.maxLen || define.some_config.SocketBufferMaxLen, startCb, newClientCb);

    function startCb() {
        let str = concatStr("listening at [", app.host, ":", app.port, "]  ", app.serverId);
        console.log(str);
        app.logger(loggerType.info, str);
        cb();
    }

    function newClientCb(socket: SocketProxy) {
        new RpcServerSocket(app, socket);
    }
}

class RpcServerSocket {
    private app: Application;
    private socket: SocketProxy;
    private id: string = "";
    private registered: boolean = false;
    private registerTimer: NodeJS.Timer = null as any;
    private heartbeatTimer: NodeJS.Timer = null as any;
    constructor(app: Application, socket: SocketProxy) {
        this.app = app;
        this.socket = socket;
        socket.on("data", this.onData.bind(this));
        socket.on("close", this.onClose.bind(this));
        this.registerTimer = setTimeout(function () {
            app.logger(loggerType.error, concatStr("register timeout, close rpc socket, ", socket.remoteAddress));
            socket.close();
        }, 10000);
    }

    /**
     * socket收到数据了
     * @param data
     */
    private onData(data: Buffer) {
        try {
            let type = data.readUInt8(0);
            if (type === define.Rpc_Msg.clientMsgIn) {
                if (!this.registered) return this.socket.close();
                this.app.backendServer.handleMsg(this.id, data);
            }
            else if (type === define.Rpc_Msg.clientMsgOut) {
                if (!this.registered) return this.socket.close();
                this.app.frontendServer.sendMsgByUids(data);
            }
            else if (type === define.Rpc_Msg.rpcMsg) {
                if (!this.registered) return this.socket.close();
                rpcService.handleMsg(this.id, data);
            }
            else if (type === define.Rpc_Msg.applySession) {
                if (!this.registered) return this.socket.close();
                this.app.frontendServer.applySession(data);
            }
            else if (type === define.Rpc_Msg.register) {
                this.registerHandle(data);
            }
            else if (type === define.Rpc_Msg.heartbeat) {
                if (!this.registered) return this.socket.close();
                this.heartbeatHandle();
                this.heartbeatResponse();
            }
            else {
                this.app.logger(loggerType.error, concatStr("illegal data type, close rpc client named " + this.id));
                this.socket.close();
            }
        } catch (e) {
            this.app.logger(loggerType.error, e.stack);
        }
    }

    /**
     * socket连接关闭了
     */
    private onClose() {
        clearTimeout(this.registerTimer);
        clearTimeout(this.heartbeatTimer);
        if (this.registered) {
            this.app.rpcPool.removeSocket(this.id);
        }
        this.app.logger(loggerType.error, concatStr("a rpc client disconnected, ", this.id, ", ", this.socket.remoteAddress));
    }

    /**
     * 注册
     */
    private registerHandle(msg: Buffer) {
        clearTimeout(this.registerTimer);
        let data: { "id": string, "serverToken": string };
        try {
            data = JSON.parse(msg.slice(1).toString());
        } catch (err) {
            this.app.logger(loggerType.error, concatStr("JSON parse error，close the rpc socket, ", this.socket.remoteAddress));
            this.socket.close();
            return;
        }

        if (data.serverToken !== this.app.serverToken) {
            this.app.logger(loggerType.error, concatStr("illegal serverToken, close the rpc socket, ", this.socket.remoteAddress));
            this.socket.close();
            return;
        }
        if (this.app.rpcPool.hasSocket(data.id)) {
            this.app.logger(loggerType.error, concatStr("already has a rpc client named ", data.id, ", close it, ", this.socket.remoteAddress));
            this.socket.close();
            return;
        }
        if (this.app.serverId <= data.id) {
            this.socket.close();
            return;
        }
        this.registered = true;
        this.id = data.id;
        this.app.rpcPool.addSocket(this.id, this.socket);

        this.app.logger(loggerType.info, concatStr("get new rpc client named ", this.id));

        // 注册成功，回应
        let buffer = Buffer.allocUnsafe(5);
        buffer.writeUInt32BE(1, 0);
        buffer.writeUInt8(define.Rpc_Msg.register, 4);
        this.socket.send(buffer);
        this.heartbeatHandle();

    }

    /**
     * 心跳
     */
    private heartbeatHandle() {
        let self = this;
        clearTimeout(this.heartbeatTimer);
        this.heartbeatTimer = setTimeout(function () {
            self.app.logger(loggerType.warn, concatStr("heartBeat time out, close it, " + self.id));
            self.socket.close();
        }, define.some_config.Time.Rpc_Heart_Beat_Time * 1000 * 2);
    }

    /**
     * 心跳回应
     */
    private heartbeatResponse() {
        let buffer = Buffer.allocUnsafe(5);
        buffer.writeUInt32BE(1, 0);
        buffer.writeUInt8(define.Rpc_Msg.heartbeat, 4);
        this.socket.send(buffer);
    }
}