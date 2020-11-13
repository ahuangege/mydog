"use strict";
/**
 * websocket通用服务端
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const ws = __importStar(require("ws"));
const define_1 = require("../util/define");
function wsServer(port, startCb, newClientCb) {
    let server = new ws.Server({ "port": port, "maxPayload": define_1.some_config.SocketBufferMaxLenUnregister }, startCb);
    server.on("connection", function (socket, req) {
        newClientCb(new WsSocket(socket, req.connection.remoteAddress));
    });
    server.on("error", (err) => {
        console.log(err);
        process.exit();
    });
    server.on("close", () => { });
}
exports.default = wsServer;
class WsSocket extends events_1.EventEmitter {
    constructor(socket, remoteAddress) {
        super();
        this.die = false;
        this.remoteAddress = "";
        this.maxLen = 0;
        this.len = 0;
        this.buffer = Buffer.allocUnsafe(0);
        this.socket = socket;
        this.remoteAddress = remoteAddress;
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
        socket.on("message", (data) => {
            if (!this.die) {
                this.emit("data", data);
            }
            else {
                this.close();
            }
        });
    }
    send(data) {
        this.socket.send(data);
    }
    close() {
        this.socket.close();
        this.socket.emit("close");
    }
}
