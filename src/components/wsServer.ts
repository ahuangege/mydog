/**
 * websocket通用服务端
 */


import { EventEmitter } from "events";
import { SocketProxy } from "../util/interfaceDefine";
import * as ws from "ws";
import { some_config } from "../util/define";

export default function wsServer(port: number, startCb: () => void, newClientCb: (socket: SocketProxy) => void) {
    let server = new ws.Server({ "port": port, "maxPayload": some_config.SocketBufferMaxLenUnregister }, startCb);
    server.on("connection", function (socket, req) {
        newClientCb(new WsSocket(socket, req.connection.remoteAddress as string));
    });
    server.on("error", (err) => {
        console.log(err);
        process.exit();
    });
    server.on("close", () => { });
}

class WsSocket extends EventEmitter implements SocketProxy {
    die: boolean = false;
    remoteAddress: string = "";
    socket: any;
    maxLen: number = 0;
    len: number = 0;
    buffer: Buffer = Buffer.allocUnsafe(0);
    constructor(socket: any, remoteAddress: string) {
        super();
        this.socket = socket;
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