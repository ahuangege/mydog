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
    private onDataFunc: (data: Buffer) => void = null as any;

    constructor(port: number, host: string, maxLen: number, noDelay: boolean, connectCb: () => void) {
        super();
        this.socket = net.connect(port, host, () => {
            this.remoteAddress = this.socket.remoteAddress as string;
            connectCb();
        });
        this.socket.setNoDelay(noDelay);
        this.maxLen = maxLen;

        this.socket.on("close", () => {
            this.onClose();
        });
        this.socket.on("error", (err) => {
            this.onClose(err);
        });

        this.onDataFunc = this.onData.bind(this);
        this.socket.on("data", this.onDataFunc);
    }

    private onClose(err?: Error) {
        if (!this.die) {
            this.die = true;
            this.socket.off("data", this.onDataFunc);
            this.emit("close", err);
        }
    }

    private onData(data: Buffer) {
        decode(this, data);
    }

    send(data: Buffer) {
        this.socket.write(data);
    }

    close() {
        this.socket.end(() => {
            setTimeout(() => {
                this.socket.destroy();
            }, 1000)
        });
        this.socket.emit("close");
    }
}