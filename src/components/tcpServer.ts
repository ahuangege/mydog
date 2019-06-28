/**
 * tcp通用服务端
 */


import * as net from "net";
import { EventEmitter } from "events";
import { SocketProxy } from "../util/interfaceDefine";
import { decode } from "./msgCoder";

export default function tcpServer(port: number, maxLen: number, startCb: () => void, newClientCb: (socket: SocketProxy) => void) {
    net.createServer(function (socket) {
        newClientCb(new NetSocket(socket, maxLen));
    }).listen(port, startCb);
}

class NetSocket extends EventEmitter implements SocketProxy {
    die: boolean = false;
    remoteAddress: string = "";
    socket: net.Socket;
    maxLen: number;
    len: number = 0;
    buffer: Buffer = Buffer.allocUnsafe(0);
    constructor(socket: net.Socket, maxLen: number) {
        super();
        this.socket = socket;
        this.maxLen = maxLen;
        this.remoteAddress = socket.remoteAddress as string;
        socket.on("close", (err) => {
            if (!this.die) {
                this.die = true;
                this.emit("close", err);
            }
        });
        socket.on("error", (err) => {
            if (!this.die) {
                this.die = true;
                this.emit("close", err);
            }
        });
        socket.on("data", (data: Buffer) => {
            if (!this.die) {
                decode(this, data);
            } else {
                this.close();
            }
        });
    }

    send(data: Buffer) {
        this.socket.write(data);
    }

    close() {
        this.socket.destroy();
        this.socket.emit("close");
    }
}