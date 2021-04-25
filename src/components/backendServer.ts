

import Application from "../application";
import { encodeRemoteData } from "./msgCoder";
import * as path from "path";
import * as fs from "fs";
import define = require("../util/define");
import { Session, initSessionApp } from "./session";
import * as protocol from "../connector/protocol";
import * as indexDts from "../..";


export class BackendServer {
    private app: Application;
    private msgHandler: { [filename: string]: any } = {};
    constructor(app: Application) {
        this.app = app;
    }

    init() {
        initSessionApp(this.app);
        protocol.init(this.app);
        let defaultEncodeDecode: Required<indexDts.I_encodeDecodeConfig> = protocol.default_encodeDecode;
        let encodeDecodeConfig = this.app.someconfig.encodeDecode || {};
        this.app.protoEncode = encodeDecodeConfig.protoEncode || defaultEncodeDecode.protoEncode;
        this.app.msgEncode = encodeDecodeConfig.msgEncode || defaultEncodeDecode.msgEncode;
        this.app.protoDecode = encodeDecodeConfig.protoDecode || defaultEncodeDecode.protoDecode;
        this.app.msgDecode = encodeDecodeConfig.msgDecode || defaultEncodeDecode.msgDecode;

        this.loadHandler();
    }


    /**
     * Back-end server load routing processing
     */
    private loadHandler() {
        let dirName = path.join(this.app.base, define.some_config.File_Dir.Servers, this.app.serverType, "handler");
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

    /**
     * The back-end server receives the client message forwarded by the front-end server
     */
    handleMsg(id: string, msg: Buffer) {
        let sessionLen = msg.readUInt16BE(1);
        let sessionBuf = msg.slice(3, 3 + sessionLen);
        let session = new Session();
        session.setAll(JSON.parse(sessionBuf.toString()));
        let cmd = msg.readUInt16BE(3 + sessionLen);
        let cmdArr = this.app.routeConfig[cmd].split('.');
        let data = this.app.msgDecode(cmd, msg.slice(5 + sessionLen));
        this.msgHandler[cmdArr[1]][cmdArr[2]](data, session, this.callback(id, cmd, session.uid));
    }


    private callback(id: string, cmd: number, uid: number) {
        let self = this;
        return function (msg: any) {
            if (msg === undefined) {
                msg = null;
            }
            let msgBuf = self.app.protoEncode(cmd, msg);
            let buf = encodeRemoteData([uid], msgBuf);
            self.app.rpcPool.sendMsg(id, buf);
        };
    }

    /**
     * Synchronize back-end session to front-end
     */
    sendSession(sid: string, sessionBuf: Buffer) {
        let buf = Buffer.allocUnsafe(5 + sessionBuf.length);
        buf.writeUInt32BE(1 + sessionBuf.length, 0);
        buf.writeUInt8(define.Rpc_Msg.applySession, 4);
        sessionBuf.copy(buf, 5);
        this.app.rpcPool.sendMsg(sid, buf);
    }

    /**
     * The back-end server sends a message to the client
     */
    sendMsgByUidSid(cmd: number, msg: any, uidsid: { "uid": number, "sid": string }[]) {
        let groups: { [sid: string]: number[] } = {};
        let group: number[];
        let one: { "uid": number, "sid": string };
        for (one of uidsid) {
            if (!one.sid) {
                continue;
            }
            group = groups[one.sid];
            if (!group) {
                group = [];
                groups[one.sid] = group;
            }
            group.push(one.uid);
        }
        let app = this.app;
        let msgBuf: Buffer = app.protoEncode(cmd, msg);
        let sid: string;
        let buf: Buffer;
        for (sid in groups) {
            buf = encodeRemoteData(groups[sid], msgBuf);
            app.rpcPool.sendMsg(sid, buf);
        }
    }

    /**
     * The back-end server sends a message to the client
     */
    sendMsgByGroup(cmd: number, msg: any, group: { [sid: string]: number[] }) {
        let app = this.app;
        let msgBuf: Buffer = app.protoEncode(cmd, msg);
        let sid: string;
        let buf: Buffer;
        for (sid in group) {
            if (group[sid].length === 0) {
                continue;
            }
            buf = encodeRemoteData(group[sid], msgBuf);
            app.rpcPool.sendMsg(sid, buf);
        }
    }
}
