
import Application from "../application";
import define = require("../util/define");
import * as path from "path";
import * as fs from "fs";
import { loggerType, I_connectorConstructor, I_clientSocket, I_clientManager, routeFunc, sessionApplyJson, encodeDecode } from "../util/interfaceDefine";
import { Session, initSessionApp } from "./session";

import * as protocol from "../connector/protocol";
import { concatStr } from "../util/appUtil";

export class FrontendServer {
    private app: Application;
    constructor(app: Application) {
        this.app = app;
    }

    /**
     * 启动
     */
    start(cb: Function) {
        initSessionApp(this.app);

        let self = this;
        let startCb = function () {
            let str = concatStr("listening at [", self.app.host, ":", self.app.clientPort, "]  ", self.app.serverId, " (clientPort)");
            console.log(str);
            self.app.logger(loggerType.info, str);
            cb && cb();
        };
        protocol.init(this.app);
        let mydog = require("../mydog");
        let connectorConstructor: I_connectorConstructor = this.app.connectorConfig.connector || mydog.connector.connectorTcp;
        let defaultEncodeDecode: encodeDecode;
        if (connectorConstructor === mydog.connector.connectorTcp) {
            defaultEncodeDecode = protocol.Tcp_EncodeDecode;
        } else if (connectorConstructor === mydog.connector.connectorWs) {
            defaultEncodeDecode = protocol.Ws_EncodeDecode;
        } else {
            defaultEncodeDecode = protocol.Tcp_EncodeDecode;
        }
        this.app.protoEncode = this.app.encodeDecodeConfig.protoEncode || defaultEncodeDecode.protoEncode;
        this.app.msgEncode = this.app.encodeDecodeConfig.msgEncode || defaultEncodeDecode.msgEncode;
        this.app.protoDecode = this.app.encodeDecodeConfig.protoDecode || defaultEncodeDecode.protoDecode;
        this.app.msgDecode = this.app.encodeDecodeConfig.msgDecode || defaultEncodeDecode.msgDecode;

        let heartbeat = 0;
        if (this.app.connectorConfig.heartbeat && Number(this.app.connectorConfig.heartbeat) > 5) {
            heartbeat = Number(this.app.connectorConfig.heartbeat);
        }
        new connectorConstructor({
            "app": this.app,
            "config": { "route": this.app.routeConfig, "heartbeat": heartbeat, "maxLen": this.app.connectorConfig.maxLen || define.some_config.SocketBufferMaxLen },
            "clientManager": new ClientManager(this.app),
            "startCb": startCb
        });
    }

    /**
     * 同步session
     */
    applySession(data: Buffer) {
        let session = JSON.parse(data.slice(1).toString()) as sessionApplyJson;
        let client = this.app.clients[session.uid];
        if (client) {
            client.session.setAll(session);
        }
    }
    /**
     * 前端服将后端服的消息转发给客户端
     */
    sendMsgByUids(data: Buffer) {
        let uidBuffLen = data.readUInt16BE(1);
        let uids = JSON.parse(data.slice(3, 3 + uidBuffLen).toString());
        let msgBuf = data.slice(3 + uidBuffLen);
        let clients = this.app.clients;
        let client: I_clientSocket;
        for (let i = 0; i < uids.length; i++) {
            client = clients[uids[i]];
            if (client) {
                client.send(msgBuf);
            }
        }
    }

}


class ClientManager implements I_clientManager {
    private app: Application;
    private msgHandler: { [filename: string]: any } = {};
    private maxConnectionNum: number = Number.POSITIVE_INFINITY;
    private serverType: string = "";
    private router: { [serverType: string]: routeFunc };
    constructor(app: Application) {
        this.app = app;
        this.serverType = app.serverType;
        this.router = this.app.router;
        if (app.connectorConfig && app.connectorConfig.maxConnectionNum && Number(app.connectorConfig.maxConnectionNum) > 0) {
            this.maxConnectionNum = Number(app.connectorConfig.maxConnectionNum);
        }
        this.loadHandler();
    }

    /**
     * 前端服务器加载路由处理
     */
    private loadHandler() {
        let dirName = path.join(this.app.base, define.some_config.File_Dir.Servers, this.serverType, "handler");
        let exists = fs.existsSync(dirName);
        if (exists) {
            let self = this;
            fs.readdirSync(dirName).forEach(function (filename) {
                if (!/\.js$/.test(filename)) {
                    return;
                }
                let name = path.basename(filename, '.js');
                let handler = require(path.join(dirName, filename));
                if (handler.default && typeof handler.default === "function") {
                    self.msgHandler[name] = new handler.default(self.app);
                } else if (typeof handler === "function") {
                    self.msgHandler[name] = new handler(self.app);
                }
            });
        }
    }


    addClient(client: I_clientSocket) {
        if (!!client.session) {
            this.app.logger(loggerType.error, concatStr("the I_client has already been added, close it"));
            client.close();
            return;
        }
        if (this.app.clientNum >= this.maxConnectionNum) {
            this.app.logger(loggerType.error, concatStr("socket num has reached the Max ", this.app.clientNum, ", close it"));
            client.close();
            return;
        }
        this.app.clientNum++;

        let session = new Session();
        session.sid = this.app.serverId;
        session.socket = client;
        client.session = session;
    }

    removeClient(client: I_clientSocket) {
        if (!client.session) {
            return;
        }
        delete this.app.clients[client.session.uid];
        this.app.clientNum--;
        if (client.session._onclosed) {
            client.session._onclosed(this.app, client.session);
        }
        client.session = null as any;
    }

    handleMsg(client: I_clientSocket, msgBuf: Buffer) {
        try {
            if (!client.session) {
                this.app.logger(loggerType.error, concatStr("cannot handle msg before registered, close it, ", client.remoteAddress));
                client.close();
                return;
            }
            let data = this.app.protoDecode(msgBuf);

            let cmd = this.app.routeConfig[data.cmdId];
            if (!cmd) {
                this.app.logger(loggerType.warn, concatStr("route index out of range, ", data.cmdId, ", ", client.remoteAddress));
                return;
            }

            let cmdArr = cmd.split('.');
            if (this.serverType === cmdArr[0]) {
                let msg = this.app.msgDecode(data.cmdId, data.msg);
                this.msgHandler[cmdArr[1]][cmdArr[2]](msg, client.session, this.callBack(client, data.cmdId));
            } else {
                this.doRemote(data.cmdId, data.msg, client.session, cmdArr[0]);
            }
        } catch (e) {
            this.app.logger(loggerType.warn, concatStr("handleMsg err,", client.remoteAddress, "\n", e.stack));
        }
    }

    /**
     * 回调
     */
    private callBack(client: I_clientSocket, cmdId: number) {
        let self = this;
        return function (msg: any) {
            if (msg === undefined) {
                msg = null;
            }
            let buf = self.app.protoEncode(cmdId, msg);
            client.send(buf);
        }
    }

    /**
     * 转发客户端消息到后端服务器
     */
    private doRemote(cmdId: number, msgBuf: Buffer, session: Session, serverType: string) {
        let tmpRouter = this.router[serverType] || this.defaultRoute;
        tmpRouter(this.app, session, serverType, (id: string) => {
            if (!this.app.rpcPool.hasSocket(id)) {
                this.app.logger(loggerType.warn, concatStr("has no backend server named ", id + ", ", session.socket.remoteAddress));
                return;
            }
            if (this.app.serversIdMap[id].frontend) {
                this.app.logger(loggerType.warn, concatStr("cannot send msg to frontendServer ", id, ", ", session.socket.remoteAddress));
                return;
            }
            let sessionBuf = Buffer.from(JSON.stringify(session.getAll()));
            let buf = Buffer.allocUnsafe(9 + sessionBuf.length + msgBuf.length);
            buf.writeUInt32BE(5 + sessionBuf.length + msgBuf.length, 0);
            buf.writeUInt8(define.Rpc_Msg.clientMsgIn, 4);
            buf.writeUInt16BE(sessionBuf.length, 5);
            sessionBuf.copy(buf, 7);
            buf.writeUInt16BE(cmdId, 7 + sessionBuf.length);
            msgBuf.copy(buf, 9 + sessionBuf.length);
            this.app.rpcPool.sendMsg(id, buf);
        });
    }

    private defaultRoute(app: Application, session: Session, serverType: string, cb: (sid: string) => void) {
        let list = app.getServersByType(serverType);
        if (list.length === 0) {
            cb("");
            return;
        }
        let index = Math.floor(Math.random() * list.length);
        cb(list[index].id);
    }
}