/**
 * tcp client
 */


import * as net from "net";
import { EventEmitter } from "events";
import { SocketProxy } from "../util/interfaceDefine";
import { decode } from "./msgCoder";

export class TcpClient extends EventEmitter implements SocketProxy {
    die: boolean = false;
    remoteAddress: string = "";
    socket: net.Socket;
    maxLen: number;
    len: number = 0;
    buffer: Buffer = null as any;
    headLen = 0;
    headBuf = Buffer.alloc(4);

    constructor(port: number, host: string, maxLen: number, noDelay: boolean, connectCb: () => void) {
        super();
        this.socket = net.connect(port, host, () => {
            this.remoteAddress = this.socket.remoteAddress as string;
            connectCb();
        });
        this.socket.setNoDelay(noDelay);
        this.maxLen = maxLen;
        this.socket.on("close", (err) => {
            if (!this.die) {
                this.die = true;
                this.emit("close", err);
            }
        });
        this.socket.on("error", (err) => {
            if (!this.die) {
                this.die = true;
                this.emit("close", err);
            }
        });
        this.socket.on("data", (data) => {
            decode(this, data);
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