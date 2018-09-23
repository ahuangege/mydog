/**
 * tcp通用客户端
 */


import * as net from "net";
import { EventEmitter } from "events";
import { SocketProxy } from "../util/interfaceDefine";
import { decode } from "./msgCoder";

export class TcpClient extends EventEmitter implements SocketProxy {
    die: boolean = false;
    socket: net.Socket;
    len: number = 0;
    buffer: Buffer = Buffer.allocUnsafe(0);

    constructor(port: number, host: string, connectCb: Function) {
        super();
        this.socket = net.connect(port, host, connectCb);
        this.socket.on("close", () => {
            if (!this.die) {
                this.die = true;
                this.emit("close");
            }
        });
        this.socket.on("error", () => {
            if (!this.die) {
                this.die = true;
                this.emit("close");
            }
        });
        this.socket.on("data", (data) => {
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