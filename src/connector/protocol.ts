
import Application from "../application";
import * as define from "../util/define";
import { I_encodeDecodeConfig } from "../util/interfaceDefine";

let app: Application;
export function init(_app: Application) {
    app = _app;
}

export let default_encodeDecode: Required<I_encodeDecodeConfig> = {
    "protoDecode": function (data: Buffer) {
        return {
            "cmd": data.readUInt16BE(1),
            "msg": data.subarray(3)
        }
    },
    "msgDecode": function (cmd: number, msg: Buffer) {
        return JSON.parse(msg.toString());
    },
    "protoEncode": function (cmd: number, msg: any) {
        let msgBuf: Buffer = app.msgEncode(cmd, msg);
        let headBuff = Buffer.allocUnsafe(7);
        headBuff.writeUInt32BE(msgBuf.length + 3, 0);
        headBuff.writeUInt8(define.Server_To_Client.msg, 4);
        headBuff.writeUInt16BE(cmd, 5);

        return { "head": headBuff, "msg": msgBuf };
    },
    "msgEncode": function (cmd: number, msg: any) {
        return Buffer.from(JSON.stringify(msg));
    }
}
