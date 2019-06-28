import { encodeDecode } from "../util/interfaceDefine";
import Application from "../application";
import * as define from "../util/define";

let app: Application;

export function init(_app: Application) {
    app = _app;
}

export let Tcp_EncodeDecode: encodeDecode = {
    "protoDecode": function (data: Buffer) {
        return {
            "cmdId": data.readUInt16BE(1),
            "msg": data.slice(3)
        }
    },
    "msgDecode": function (cmdId: number, msg: Buffer) {
        return JSON.parse(msg.toString());
    },
    "protoEncode": function (cmdId: number, msg: any) {
        let msgBuf: Buffer = app.msgEncode(cmdId, msg);
        let buf = Buffer.allocUnsafe(msgBuf.length + 7);
        buf.writeUInt32BE(msgBuf.length + 3, 0);
        buf.writeUInt8(define.Server_To_Client.msg, 4);
        buf.writeUInt16BE(cmdId, 5);
        msgBuf.copy(buf, 7);
        return buf;
    },
    "msgEncode": function (cmdId: number, msg: any) {
        return Buffer.from(JSON.stringify(msg));
    }
}


export let Ws_EncodeDecode: encodeDecode = {
    "protoDecode": function (data: Buffer) {
        return {
            "cmdId": data.readUInt16BE(1),
            "msg": data.slice(3)
        }
    },
    "msgDecode": function (cmdId: number, msg: Buffer) {
        return JSON.parse(msg.toString());
    },
    "protoEncode": function (cmdId: number, msg: any) {
        let msgBuf: Buffer = app.msgEncode(cmdId, msg);
        let buf = Buffer.allocUnsafe(msgBuf.length + 3);
        buf.writeUInt8(define.Server_To_Client.msg, 0);
        buf.writeUInt16BE(cmdId, 1);
        msgBuf.copy(buf, 3);
        return buf;
    },
    "msgEncode": function (cmdId: number, msg: any) {
        return Buffer.from(JSON.stringify(msg));
    }
}