/**
 * 后端服务器启动监听端口，并接受前端服务器的连接
 */


import Application from "../application";
import { encodeRemoteData } from "./msgCoder";
import * as path from "path";
import * as fs from "fs";
import define = require("../util/define");
import { sessionApplyJson, encodeDecode, I_connectorConstructor } from "../util/interfaceDefine";
import { Session, initSessionApp } from "./session";

import * as protocol from "../connector/protocol";


export class BackendServer {
    private app: Application;
    private msgHandler: { [filename: string]: any } = {};
    constructor(app: Application) {
        this.app = app;
    }

    init() {
        initSessionApp(this.app);
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

        this.loadHandler();
    }


    /**
     * 后端服务器加载路由处理
     */
    private loadHandler() {
        let dirName = path.join(this.app.base, define.some_config.File_Dir.Servers, this.app.serverType, "handler");
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
                }
            });
        }
    }

    /**
     * 后端服务器收到前端服转发的客户端消息
     */
    handleMsg(id: string, msg: Buffer) {
        let sessionLen = msg.readUInt16BE(1);
        let sessionBuf = msg.slice(3, 3 + sessionLen);
        let session = new Session();
        session.setAll(JSON.parse(sessionBuf.toString()));
        let cmdId = msg.readUInt16BE(3 + sessionLen);
        let cmdArr = this.app.routeConfig[cmdId].split('.');
        let data = this.app.msgDecode(cmdId, msg.slice(5 + sessionLen));
        this.msgHandler[cmdArr[1]][cmdArr[2]](data, session, this.callback(id, cmdId, session.uid));
    }


    private callback(id: string, cmdId: number, uid: number) {
        let self = this;
        return function (msg: any) {
            if (msg === undefined) {
                msg = null;
            }
            let msgBuf = self.app.protoEncode(cmdId, msg);
            let buf = encodeRemoteData([uid], msgBuf);
            self.app.rpcPool.sendMsg(id, buf);
        };
    }

    /**
     * 后端session同步到前端
     */
    sendSession(session: sessionApplyJson) {
        let msgBuf = Buffer.from(JSON.stringify(session));
        let buf = Buffer.allocUnsafe(5 + msgBuf.length);
        buf.writeUInt32BE(1 + msgBuf.length, 0);
        buf.writeUInt8(define.Rpc_Msg.applySession, 4);
        msgBuf.copy(buf, 5);
        this.app.rpcPool.sendMsg(session.sid, buf);
    }

    /**
     * 后端服务器给客户端发消息
     */
    sendMsgByUidSid(cmdIndex: number, msg: any, uidsid: { "uid": number, "sid": string }[]) {
        let groups: { [sid: string]: number[] } = {};
        let group: number[];
        for (let one of uidsid) {
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
        let msgBuf: Buffer = app.protoEncode(cmdIndex, msg);
        for (let sid in groups) {
            let buf = encodeRemoteData(groups[sid], msgBuf);
            app.rpcPool.sendMsg(sid, buf);
        }
    }
}
