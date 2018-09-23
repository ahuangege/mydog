/**
 * websocket通用服务端
 */


import { EventEmitter } from "events";
import { SocketProxy } from "../util/interfaceDefine";
import { decode } from "./msgCoder";
let ws = require("ws");

export default function wsServer(port: number, startCb: Function, newClientCb: Function) {
    let server = new ws.Server({ "port": port }, startCb);
    server.on("connection", function (socket: any) {
        newClientCb(new WsSocket(socket));
    });
}

class WsSocket extends EventEmitter implements SocketProxy {
    die: boolean = false;
    socket: any;
    len: number = 0;
    buffer: Buffer = Buffer.allocUnsafe(0);
    constructor(socket: any) {
        super();
        this.socket = socket;
        socket.on("close", () => {
            if (!this.die) {
                this.die = true;
                this.emit("close");
            }
        });
        socket.on("error", () => {
            if (!this.die) {
                this.die = true;
                this.emit("close");
            }
        });
        socket.on("data", (data: Buffer) => {
            if (!this.die) {
                decode(this, data);
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