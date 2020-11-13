"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeRemoteData = exports.encodeInnerData = exports.decode = void 0;
/**
 * 拆包
 */
function decode(socket, msg) {
    let readLen = 0;
    while (readLen < msg.length) {
        if (socket.len === 0) //data length is unknown
         {
            socket.buffer = Buffer.concat([socket.buffer, Buffer.from([msg[readLen]])]);
            if (socket.buffer.length === 4) {
                socket.len = socket.buffer.readUInt32BE(0);
                if (socket.len > socket.maxLen || socket.len === 0) {
                    socket.close();
                    throw new Error("socket data length is longer then " + socket.maxLen + ", close it, " + socket.remoteAddress);
                    return;
                }
                socket.buffer = Buffer.allocUnsafe(socket.len);
            }
            readLen++;
        }
        else if (msg.length - readLen < socket.len) // data not coming all
         {
            msg.copy(socket.buffer, socket.buffer.length - socket.len, readLen);
            socket.len -= (msg.length - readLen);
            readLen = msg.length;
        }
        else {
            msg.copy(socket.buffer, socket.buffer.length - socket.len, readLen, readLen + socket.len);
            readLen += socket.len;
            socket.len = 0;
            let data = socket.buffer;
            socket.buffer = Buffer.allocUnsafe(0);
            //data coming all
            socket.emit("data", data);
        }
    }
}
exports.decode = decode;
/**
 * 部分内部通信消息格式
 */
function encodeInnerData(data) {
    let dataBuf = Buffer.from(JSON.stringify(data));
    let buffer = Buffer.allocUnsafe(dataBuf.length + 4);
    buffer.writeUInt32BE(dataBuf.length, 0);
    dataBuf.copy(buffer, 4);
    return buffer;
}
exports.encodeInnerData = encodeInnerData;
;
/**
 *  后端服务器，发送给前端服务器的消息格式
 *
 *     [4]        [1]      [2]       [...]    [...]
 *  allMsgLen   msgType  uidBufLen   uids   clientMsgBuf
 *
 *  其中clientMsgBuf由前端服务器直接发送给客户端
 */
function encodeRemoteData(uids, dataBuf) {
    let uidsBuf = Buffer.from(JSON.stringify(uids));
    let buf = Buffer.allocUnsafe(7 + uidsBuf.length + dataBuf.length);
    buf.writeUInt32BE(3 + uidsBuf.length + dataBuf.length, 0);
    buf.writeUInt8(5 /* clientMsgOut */, 4);
    buf.writeUInt16BE(uidsBuf.length, 5);
    uidsBuf.copy(buf, 7);
    dataBuf.copy(buf, 7 + uidsBuf.length);
    return buf;
}
exports.encodeRemoteData = encodeRemoteData;
