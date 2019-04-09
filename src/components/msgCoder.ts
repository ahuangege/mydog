/**
 * 通用编码解码模块
 */
import define = require("../util/define");
import { SocketProxy, encode_func } from "../util/interfaceDefine";

const MAX_lEN = 10 * 1024 * 1024;
let encode: encode_func | null = null;

/**
 * 拆包
 */
export function decode(socket: SocketProxy, msg: Buffer) {
    let readLen = 0;
    while (readLen < msg.length) {
        if (socket.len === 0) //data length is unknown
        {
            socket.buffer = Buffer.concat([socket.buffer, Buffer.from([msg[readLen]])]);
            if (socket.buffer.length === 4) {
                socket.len = socket.buffer.readUInt32BE(0);
                if (socket.len > MAX_lEN || socket.len === 0) {
                    throw new Error("socket data length is longer then " + MAX_lEN + ", close it!");
                    socket.close();
                    return;
                }
                socket.buffer = Buffer.allocUnsafe(socket.len);
            }
            readLen++;
        }
        else if (msg.length - readLen < socket.len)	// data not coming all
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
};

/**
 * 设置编码函数
 */
export function setEncode(_encode: encode_func) {
    encode = _encode;
};


/**
 * 部分内部通信消息格式
 */
export function encodeInnerData(data: any) {
    let dataBuf: Buffer = Buffer.from(JSON.stringify(data));
    let buffer = Buffer.allocUnsafe(dataBuf.length + 4);
    buffer.writeUInt32BE(dataBuf.length, 0);
    dataBuf.copy(buffer, 4);
    return buffer;
};


/**
 *  前端服务器，发送给客户端的消息格式
 *
 *     [4]     [1]      [1]    [...]
 *    msgLen  msgType  cmdId   msgBuf
 */
export function encodeClientData(cmdId: number, data: any) {
    let msgBuf: Buffer;
    if (encode) {
        msgBuf = encode(cmdId, data);
    } else {
        msgBuf = Buffer.from(JSON.stringify(data));
    }
    let buf = Buffer.allocUnsafe(msgBuf.length + 6);
    buf.writeUInt32BE(msgBuf.length + 2, 0);
    buf.writeUInt8(define.Server_To_Client.msg, 4);
    buf.writeUInt8(cmdId, 5);
    msgBuf.copy(buf, 6);
    return buf;
};

/**
 * 后端发送给客户端消息，预编码
 */
export function encodeRemoteData_1(cmdId: number, data: any) {
    let msgBuf: Buffer;
    if (encode) {
        msgBuf = encode(cmdId, data);
    } else {
        msgBuf = Buffer.from(JSON.stringify(data));
    }
    return msgBuf;
}



/**
 *  后端服务器，发送给前端服务器的消息格式
 *
 *     [4]        [1]      [2]       [...]    [...]
 *  allMsgLen   msgType  uidBufLen   uids   clientMsgBuf
 *
 *  其中clientMsgBuf由前端服务器直接发送给客户端
 *     [4]     [1]      [1]    [...]
 *    msgLen  msgType  cmdId   msgBuf
 */

export function encodeRemoteData_2(uids: number[], cmdId: number, dataBuf: Buffer) {
    let uidsBuf = Buffer.from(JSON.stringify(uids));
    let buf = Buffer.allocUnsafe(13 + uidsBuf.length + dataBuf.length);
    buf.writeUInt32BE(9 + uidsBuf.length + dataBuf.length, 0);
    buf.writeUInt8(define.Back_To_Front.msg, 4);
    buf.writeUInt16BE(uidsBuf.length, 5);
    uidsBuf.copy(buf, 7);
    buf.writeUInt32BE(2 + dataBuf.length, 7 + uidsBuf.length);
    buf.writeUInt8(define.Server_To_Client.msg, 11 + uidsBuf.length);
    buf.writeUInt8(cmdId, 12 + uidsBuf.length);
    dataBuf.copy(buf, 13 + uidsBuf.length);
    return buf;
};

