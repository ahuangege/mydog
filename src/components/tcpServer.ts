/**
 * tcp通用服务端
 */


import * as net from "net";
import { EventEmitter } from "events";
import { SocketProxy } from "../util/interfaceDefine";
import { decode } from "./msgCoder";

export default function tcpServer(port: number, startCb: () => void, newClientCb: Function) {
    net.createServer(function (socket) {
        newClientCb(new NetSocket(socket));
    }).listen(port, startCb);
}

class NetSocket extends EventEmitter implements SocketProxy {
    die: boolean = false;
    socket: net.Socket;
    len: number = 0;
    buffer: Buffer = Buffer.allocUnsafe(0);
    constructor(socket: net.Socket) {
        super();
        this.socket = socket;
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
                self.close();
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