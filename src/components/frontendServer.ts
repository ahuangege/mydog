
import Application from "../application";
import define = require("../util/define");
import * as path from "path";
import * as fs from "fs";
import { sessionCopyJson, I_clientSocket, I_clientManager, I_connectorConstructor, I_encodeDecodeConfig, loggerLevel } from "../util/interfaceDefine";
import { Session, initSessionApp } from "./session";
import * as protocol from "../connector/protocol";
let meFilename = `[${path.basename(__filename, ".js")}.ts]`;

export class FrontendServer {
    private app: Application;
    private clientManager: ClientManager;
    constructor(app: Application) {
        this.app = app;
        initSessionApp(this.app);
        protocol.init(this.app);

        let defaultEncodeDecode: Required<I_encodeDecodeConfig> = protocol.default_encodeDecode;
        let encodeDecodeConfig = this.app.someconfig.encodeDecode || {};
        this.app.protoEncode = encodeDecodeConfig.protoEncode || defaultEncodeDecode.protoEncode;
        this.app.msgEncode = encodeDecodeConfig.msgEncode || defaultEncodeDecode.msgEncode;
        this.app.protoDecode = encodeDecodeConfig.protoDecode || defaultEncodeDecode.protoDecode;
        this.app.msgDecode = encodeDecodeConfig.msgDecode || defaultEncodeDecode.msgDecode;

        this.clientManager = new ClientManager(app);
    }

    start(cb: Function) {

        let self = this;
        let startCb = function () {
            let str = `listening at [${self.app.serverInfo.host}:${self.app.serverInfo.clientPort}]  ${self.app.serverId} (clientPort)`;
            console.log(str);
            cb && cb();
        };

        let mydog = require("../mydog");
        let connectorConfig = this.app.someconfig.connector || {};
        let connectorConstructor: I_connectorConstructor = connectorConfig.connector || mydog.connector.Tcp;

        new connectorConstructor({
            "app": this.app,
            "clientManager": this.clientManager,
            "config": this.app.someconfig.connector,
            "startCb": startCb
        });
    }

    /**
     * Sync session
     */
    applySession(data: Buffer) {
        let session = JSON.parse(data.slice(1).toString()) as sessionCopyJson;
        let client = this.app.clients[session.uid];
        if (client) {
            client.session.applySession(session.settings);
        }
    }
    /**
     * The front-end server forwards the message of the back-end server to the client
     */
    sendMsgByUids(data: Buffer) {
        let uidsLen = data.readUInt16BE(1);
        let msgBuf = data.slice(3 + uidsLen * 4);
        let clients = this.app.clients;
        let client: I_clientSocket;
        let i: number;
        for (i = 0; i < uidsLen; i++) {
            client = clients[data.readUInt32BE(3 + i * 4)];
            if (client) {
                client.send(msgBuf);
            }
        }
    }

}

function clientOnOffCb() {

}

class ClientManager implements I_clientManager {
    private app: Application;
    private msgHandler: { [filename: string]: any } = {};
    private serverType: string = "";
    private router: { [serverType: string]: (session: Session) => string };
    private clientOnCb: (session: Session) => void = null as any;
    private clientOffCb: (session: Session) => void = null as any;
    constructor(app: Application) {
        this.app = app;
        this.serverType = app.serverType;
        this.router = this.app.router;
        let connectorConfig = this.app.someconfig.connector || {};
        this.clientOnCb = connectorConfig.clientOnCb || clientOnOffCb;
        this.clientOffCb = connectorConfig.clientOffCb || clientOnOffCb;
        this.loadHandler();
    }

    /**
     * Front-end server load routing processing
     */
    private loadHandler() {
        let dirName = path.join(this.app.base, define.some_config.File_Dir.Servers, this.serverType, "handler");
        let exists = fs.existsSync(dirName);
        if (exists) {
            let self = this;
            fs.readdirSync(dirName).forEach(function (filename) {
                if (!filename.endsWith(".js")) {
                    return;
                }
                let name = path.basename(filename, '.js');
                let handler = require(path.join(dirName, filename));
                if (handler.default && typeof handler.default === "function") {
                    self.msgHandler[name] = new handler.default(self.app);
                }
            });
        }
    }


    addClient(client: I_clientSocket) {
        if (client.session) {
            this.app.logger(loggerLevel.error, `${meFilename} the I_client has already been added, close it`);
            client.close();
            return;
        }
        this.app.clientNum++;

        let session = new Session(this.app.serverId);
        session.socket = client;
        client.session = session;
        this.clientOnCb(session as any);
    }

    removeClient(client: I_clientSocket) {
        let session = client.session;
        if (!session) {
            return;
        }

        delete this.app.clients[session.uid];
        this.app.clientNum--;

        client.session = null as any;
        session.socket = null as any;
        this.clientOffCb(session as any);
    }

    handleMsg(client: I_clientSocket, msgBuf: Buffer) {
        try {
            if (!client.session) {
                this.app.logger(loggerLevel.error, `${meFilename} cannot handle msg before added, close it`);
                client.close();
                return;
            }
            let data = this.app.protoDecode(msgBuf);

            this.app.filter.globalBeforeFilter(data, client.session, (hasError) => {
                if (hasError) {
                    return;
                }
                let cmdArr = this.app.routeConfig2[data.cmd];
                if (this.serverType === cmdArr[0]) {
                    let msg = this.app.msgDecode(data.cmd, data.msg);
                    this.app.filter.beforeFilter(data.cmd, msg, client.session, (hasError) => {
                        if (hasError) {
                            return;
                        }
                        this.msgHandler[cmdArr[1]][cmdArr[2]](msg, client.session, this.callBack(client, data.cmd));
                    });
                } else {
                    this.doRemote(data, client.session, cmdArr);
                }
            });
        } catch (e: any) {
            this.app.logger(loggerLevel.error, e);
        }
    }

    /**
     * Callback
     */
    private callBack(client: I_clientSocket, cmd: number) {
        let self = this;
        return function (msg: any) {
            if (msg === undefined) {
                msg = null;
            }
            let buf = self.app.protoEncode(cmd, msg);
            client.send(buf);
            self.app.filter.afterFilter(cmd, msg, client.session);
        }
    }

    /**
     * Forward client messages to the backend server
     */
    private doRemote(msg: { "cmd": number, "msg": Buffer }, session: Session, cmdArr: string[]) {
        let id = this.router[cmdArr[0]](session);
        let socket = this.app.rpcPool.getSocket(id);
        if (!socket) {
            return;
        }
        let svr = this.app.serversIdMap[id];
        if (svr.serverType !== cmdArr[0] || svr.frontend) {
            this.app.logger(loggerLevel.error, `${meFilename} illegal doRemote`);
            return;
        }
        let sessionBuf = session.sessionBuf;
        let buf = Buffer.allocUnsafe(9 + sessionBuf.length + msg.msg.length);
        buf.writeUInt32BE(5 + sessionBuf.length + msg.msg.length, 0);
        buf.writeUInt8(define.Rpc_Msg.clientMsgIn, 4);
        buf.writeUInt16BE(sessionBuf.length, 5);
        sessionBuf.copy(buf, 7);
        buf.writeUInt16BE(msg.cmd, 7 + sessionBuf.length);
        msg.msg.copy(buf, 9 + sessionBuf.length);
        socket.send(buf);
    }
}