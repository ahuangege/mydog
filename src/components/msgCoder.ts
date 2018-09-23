/**
 * 通用编码解码模块
 */
import define from "../util/define";
import { SocketProxy } from "../util/interfaceDefine";

const MAX_lEN = 10 * 1024 * 1024;
let encode: Function | null = null;

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
                if (socket.len > MAX_lEN) {
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
export function setEncode(_encode: Function) {
    encode = _encode;
};


/**
 * 部分内部通信消息格式
 */
export function encodeInnerData(data: any) {
    data = JSON.stringify(data);
    data = Buffer.from(data);
    let buffer = Buffer.allocUnsafe(data.length + 4);
    buffer.writeUInt32BE(data.length, 0);
    data.copy(buffer, 4);
    return buffer;
};


/**
 *  前端服务器，发送给客户端的消息格式
 *
 *     [4]     [1]      [1]    [...]
 *    msgLen  msgType  cmdId   msgBuf
 */
export function encodeClientData(cmdId: number, data: any) {
    if (encode) {
        data = encode(cmdId, data);
    } else {
        data = Buffer.from(JSON.stringify(data));
    }
    let buf = Buffer.allocUnsafe(data.length + 6);
    buf.writeUInt32BE(data.length + 2, 0);
    buf.writeUInt8(define.Server_To_Client.msg, 4);
    buf.writeUInt8(cmdId, 5);
    data.copy(buf, 6);
    return buf;
};

/**
 * 编码
 */
export function encodeData(cmdId: number, msg: any) {
    let msgBuf: Buffer;
    if (encode) {
        msgBuf = encode(cmdId, msg);
    } else {
        msgBuf = Buffer.from(JSON.stringify(msg));
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

export function encodeRemoteData(uids: number[], cmdId: number, msgBuf: Buffer) {
    let uidsBuf = Buffer.from(JSON.stringify(uids));
    let buf = Buffer.allocUnsafe(13 + uidsBuf.length + msgBuf.length);
    buf.writeUInt32BE(9 + uidsBuf.length + msgBuf.length, 0);
    buf.writeUInt8(define.Back_To_Front.msg, 4);
    buf.writeUInt16BE(uidsBuf.length, 5);
    uidsBuf.copy(buf, 7);
    buf.writeUInt32BE(2 + msgBuf.length, 7 + uidsBuf.length);
    buf.writeUInt8(define.Server_To_Client.msg, 11 + uidsBuf.length);
    buf.writeUInt8(cmdId, 12 + uidsBuf.length);
    msgBuf.copy(buf, 13 + uidsBuf.length);
    return buf;
};

