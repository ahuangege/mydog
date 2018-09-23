/**
 * 前端服务器，对后端服务器连接的管理
 */

import Application from "../application";
import { ServerInfo, SocketProxy, sessionApplyJson, loggerType, componentName } from "../util/interfaceDefine";
import { TcpClient } from "./tcpClient";
import define from "../util/define";
import { Session } from "./session";

let app: Application;
let appClients: { [uid: number]: Session }
let clients: { [serverType: string]: { [id: string]: remote_frontend_client } } = {};
let router: any;

/**
 * 初始化
 */
export function init(_app: Application) {
    app = _app;
    router = app.router;
    appClients = app.clients;
}

/**
 * 新增后端服务器
 * @param server 后端服务器信息
 */
export function addServer(server: { "serverType": string; "serverInfo": ServerInfo }) {
    if (clients[server.serverType] && clients[server.serverType][server.serverInfo.id]) {
        clients[server.serverType][server.serverInfo.id].close();
    }
    if (!clients[server.serverType]) {
        clients[server.serverType] = {};
    }
    clients[server.serverType][server.serverInfo.id] = new remote_frontend_client(server);
}

/**
 * 移除后端服务器
 * @param serverInfo 后端服务器信息
 */
export function removeServer(serverInfo: { "serverType": string; "id": string }) {
    if(clients[serverInfo.serverType] && clients[serverInfo.serverType][serverInfo.id]){
        clients[serverInfo.serverType][serverInfo.id].close();
    }
}

/**
 * 转发客户端的消息至后端服务器
 * @param msgBuf 消息
 * @param session session信息
 * @param serverType 服务器类型
 */
export function doRemote(msgBuf: Buffer, session: Session, serverType: string) {
    if (!clients[serverType]) {
        app.logger(loggerType.warn, componentName.remoteFrontend, app.serverId + " has no backend serverType: " + serverType);
        return;
    }
    let tmpRouter = router[serverType];
    if (!tmpRouter) {
        tmpRouter = defaultRoute;
    }
    tmpRouter(app, session, serverType, function (err: any, sid: string) {
        if (err) {
            app.logger(loggerType.debug, componentName.remoteFrontend, err);
            return;
        }
        let client = clients[serverType][sid];
        if (!client || !client.isLive) {
            app.logger(loggerType.debug, componentName.remoteFrontend, app.serverId + " has no backend server " + sid);
            return;
        }
        let sessionBuf = Buffer.from(JSON.stringify(session.getAll()));
        let buf = Buffer.allocUnsafe(7 + sessionBuf.length + msgBuf.length);
        buf.writeUInt32BE(3 + sessionBuf.length + msgBuf.length, 0);
        buf.writeUInt8(define.Front_To_Back.msg, 4);
        buf.writeUInt16BE(sessionBuf.length, 5);
        sessionBuf.copy(buf, 7);
        msgBuf.copy(buf, 7 + sessionBuf.length);
        client.send(buf);
    });
};

function defaultRoute(app: Application, session: Session, serverType: string, cb: Function) {
    let list = app.getServersByType(serverType);
    if (!list || !list.length) {
        cb(app.serverId + " has no such serverType: " + serverType);
        return;
    }
    let index = Math.floor(Math.random() * list.length);
    cb(null, list[index].id);
};

/**
 * 前端连接到后端的socket
 */
class remote_frontend_client {
    private id: string;
    private host: string;
    private port: number;
    private serverType: string;
    private connect_timer: NodeJS.Timer | null = null;
    private heartbeat_timer: NodeJS.Timer | null = null;
    private socket: SocketProxy = null as any;
    public isLive: boolean = false;

    constructor(server: { "serverType": string; "serverInfo": ServerInfo }) {
        this.id = server.serverInfo.id;
        this.host = server.serverInfo.host;
        this.port = server.serverInfo.port;
        this.serverType = server.serverType;
        this.doConnect(0);
    }

    /**
     * 开始连接
     * @param delay 延时
     */
    private doConnect(delay: number) {
        this.isLive = false;
        let self = this;
        this.connect_timer = setTimeout(function () {

            self.socket = new TcpClient(self.port, self.host, function () {
                app.logger(loggerType.info, componentName.remoteFrontend, app.serverId + " remote connect " + self.id + " success");


                // 注册
                let loginBuf = Buffer.from(JSON.stringify({
                    sid: app.serverId,
                    serverToken: app.serverToken
                }));
                let buf = Buffer.allocUnsafe(loginBuf.length + 5);
                buf.writeUInt32BE(loginBuf.length + 1, 0);
                buf.writeUInt8(define.Front_To_Back.register, 4);
                loginBuf.copy(buf, 5);
                self.socket.send(buf);
                self.isLive = true;

                //心跳包
                self.heartbeat();
            });

            self.socket.on("data", self.data_switch.bind(self));
            self.socket.on("close", function () {
                clearTimeout(self.heartbeat_timer as NodeJS.Timer);
                app.logger(loggerType.warn, componentName.remoteFrontend, app.serverId + " remote connect " + self.id + " closed, reconnect later");
                self.doConnect(define.Time.Remote_Reconnect_Time * 1000);
            });
        }, delay);
    }

    /**
     * 心跳
     */
    private heartbeat() {
        let self = this;
        this.heartbeat_timer = setTimeout(function () {
            let buf = Buffer.allocUnsafe(5);
            buf.writeUInt32BE(1, 0);
            buf.writeUInt8(define.Front_To_Back.heartbeat, 4);
            (self.socket as SocketProxy).send(buf);
            self.heartbeat();
        }, define.Time.Remote_Heart_Beat_Time * 1000)
    }

    /**
     * 消息分类
     */
    private data_switch(msg: Buffer) {
        let type = msg.readUInt8(0);
        if (type === define.Back_To_Front.msg) {
            this.msg_handle(msg);
        } else if (type === define.Back_To_Front.applySession) {
            this.applySession_handle(msg);
        }
    }

    /**
     * 发送给客户端的消息
     */
    private msg_handle(data: Buffer) {
        let uidsBufLen = data.readUInt16BE(1);
        let uids: number[] = JSON.parse(data.slice(3, 3 + uidsBufLen).toString());
        let msgBuf = data.slice(3 + uidsBufLen);

        let client: Session;
        for (let i = 0; i < uids.length; i++) {
            client = appClients[uids[i]];
            if (client) {
                client.socket.send(msgBuf);
            }
        }
    }

    /**
     * 同步session的消息
     */
    private applySession_handle(data: Buffer) {
        let session = JSON.parse(data.slice(1).toString()) as sessionApplyJson;
        let client = appClients[session.uid];
        if (client) {
            client.setAll(session);
        }
    }

    /**
     * 发送数据
     * @param buf 
     */
    send(buf: Buffer) {
        this.socket.send(buf);
    }

    /**
     * 关闭连接
     */
    close() {
        delete clients[this.serverType][this.id];
        if (this.socket) {
            this.socket.close();
        }
        clearTimeout(this.connect_timer as NodeJS.Timer);
    }
}