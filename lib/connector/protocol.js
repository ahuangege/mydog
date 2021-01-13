"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Ws_EncodeDecode = exports.Tcp_EncodeDecode = exports.init = void 0;
let app;
function init(_app) {
    app = _app;
}
exports.init = init;
exports.Tcp_EncodeDecode = {
    "protoDecode": function (data) {
        return {
            "cmd": data.readUInt16BE(1),
            "msg": data.slice(3)
        };
    },
    "msgDecode": function (cmd, msg) {
        return JSON.parse(msg.toString());
    },
    "protoEncode": function (cmd, msg) {
        let msgBuf = app.msgEncode(cmd, msg);
        let buf = Buffer.allocUnsafe(msgBuf.length + 7);
        buf.writeUInt32BE(msgBuf.length + 3, 0);
        buf.writeUInt8(1 /* msg */, 4);
        buf.writeUInt16BE(cmd, 5);
        msgBuf.copy(buf, 7);
        return buf;
    },
    "msgEncode": function (cmd, msg) {
        return Buffer.from(JSON.stringify(msg));
    }
};
exports.Ws_EncodeDecode = {
    "protoDecode": function (data) {
        return {
            "cmd": data.readUInt16BE(1),
            "msg": data.slice(3)
        };
    },
    "msgDecode": function (cmd, msg) {
        return JSON.parse(msg.toString());
    },
    "protoEncode": function (cmd, msg) {
        let msgBuf = app.msgEncode(cmd, msg);
        let buf = Buffer.allocUnsafe(msgBuf.length + 3);
        buf.writeUInt8(1 /* msg */, 0);
        buf.writeUInt16BE(cmd, 1);
        msgBuf.copy(buf, 3);
        return buf;
    },
    "msgEncode": function (cmd, msg) {
        return Buffer.from(JSON.stringify(msg));
    }
};
