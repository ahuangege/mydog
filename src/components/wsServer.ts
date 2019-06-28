/**
 * websocket通用服务端
 */


import { EventEmitter } from "events";
import { SocketProxy } from "../util/interfaceDefine";
import * as ws from "ws";

export default function wsServer(port: number, maxLen: number, startCb: () => void, newClientCb: (socket: SocketProxy) => void) {
    let server = new ws.Server({ "port": port }, startCb);
    server.on("connection", function (socket, req) {
        newClientCb(new WsSocket(socket, req.connection.remoteAddress as string, maxLen));
    });
}

class WsSocket extends EventEmitter implements SocketProxy {
    die: boolean = false;
    remoteAddress: string = "";
    socket: any;
    maxLen: number;
    len: number = 0;
    buffer: Buffer = Buffer.allocUnsafe(0);
    constructor(socket: any, remoteAddress: string, maxLen: number) {
        super();
        this.socket = socket;
        this.maxLen = maxLen;
        this.remoteAddress = remoteAddress;
        socket.on("close", (err: any) => {
            if (!this.die) {
                this.die = true;
                this.emit("close", err);
            }
        });
        socket.on("error", (err: any) => {
            if (!this.die) {
                this.die = true;
                this.emit("close", err);
            }
        });
        socket.on("message", (data: Buffer) => {
            if (!this.die) {
                this.emit("data", data);
            } else {
                this.close()
            }
        });
    }

    send(data: Buffer) {
        this.socket.send(data);
    }

    close() {
        this.socket.close();
        this.socket.emit("close");
    }
}