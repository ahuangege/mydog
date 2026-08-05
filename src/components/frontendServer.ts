
import Application from "../application";
import * as define from "../util/define";
import * as path from "path";
import * as fs from "fs";
import { sessionCopyJson, I_clientSocket, I_clientManager, I_connectorConstructor, I_encodeDecodeConfig, loggerLevel } from "../util/interfaceDefine";
import { Session, initSessionApp } from "./session";
import * as protocol from "../connector/protocol";
let meFilename = `[${path.basename(__filename, ".js")}.ts]`;
import * as mydog from "../mydog";

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
    private router: { [serverType: string]: (session: Session, cmd: number) => string };
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

    async handleMsg(client: I_clientSocket, msgBuf: Buffer) {
        try {
            if (!client.session) {
                this.app.logger(loggerLevel.error, `${meFilename} cannot handle msg before added, close it`);
                client.close();
                return;
            }
            let data = this.app.protoDecode(msgBuf);

            const ok = await this.app.filter.globalBeforeFilter(data, client.session);
            if (!ok) {
                return;
            }

            let cmdArr = this.app.routeConfig2[data.cmd];
            if (!cmdArr || cmdArr.length !== 3) {
                return;
            }

            if (this.serverType === cmdArr[0]) {
                let msg = this.app.msgDecode(data.cmd, data.msg);
                const ok = await this.app.filter.beforeFilter(data.cmd, msg, client.session);
                if (!ok) {
                    return;
                }

                const rsp = await this.msgHandler[cmdArr[1]][cmdArr[2]](msg, client.session);
                if (rsp) {
                    let buf = this.app.protoEncode(data.cmd, rsp);
                    client.send(buf);
                }
                this.app.filter.afterFilter(data.cmd, rsp, client.session);

            } else {
                if (!client.session.uid) {
                    return;
                }
                this.doRemote(data, client.session, cmdArr);
            }

        } catch (e: any) {
            this.app.logger(loggerLevel.error, e);
        }
    }

    /**
     * Forward client messages to the backend server
     */
    private doRemote(msg: { "cmd": number, "msg": Buffer }, session: Session, cmdArr: string[]) {
        let id = this.router[cmdArr[0]](session, msg.cmd);
        let socket = this.app.rpcPool.getSocket(id);
        if (!socket) {
            return;
        }
        let svr = this.app.getServerById(id);
        if (svr.serverType !== cmdArr[0] || svr.frontend) {
            this.app.logger(loggerLevel.error, `${meFilename} illegal doRemote`);
            return;
        }
        let buf = Buffer.allocUnsafe(15 + msg.msg.length);
        buf.writeUInt32BE(11 + msg.msg.length, 0);
        buf.writeUInt8(define.Rpc_Msg.clientMsgIn, 4);
        buf.writeUInt16BE(msg.cmd, 5);
        buf.writeUInt32BE(session.uid, 7);
        buf.writeUInt32BE(session.version, 11);
        msg.msg.copy(buf, 15);
        socket.send(buf);
    }
}