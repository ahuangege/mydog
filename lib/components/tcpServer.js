"use strict";
/**
 * tcp通用服务端
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
const net = __importStar(require("net"));
const events_1 = require("events");
const msgCoder_1 = require("./msgCoder");
const define_1 = require("../util/define");
function tcpServer(port, noDelay, startCb, newClientCb) {
    let svr = net.createServer(function (socket) {
        socket.setNoDelay(noDelay);
        newClientCb(new NetSocket(socket));
    }).listen(port, startCb);
    svr.on("error", (err) => {
        console.log(err);
        process.exit();
    });
    svr.on("close", () => { });
}
exports.default = tcpServer;
class NetSocket extends events_1.EventEmitter {
    constructor(socket) {
        super();
        this.die = false;
        this.remoteAddress = "";
        this.len = 0;
        this.buffer = Buffer.allocUnsafe(0);
        this.socket = socket;
        this.maxLen = define_1.some_config.SocketBufferMaxLenUnregister;
        this.remoteAddress = socket.remoteAddress;
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
        socket.on("data", (data) => {
            if (!this.die) {
                msgCoder_1.decode(this, data);
            }
            else {
                this.close();
            }
        });
    }
    send(data) {
        this.socket.write(data);
    }
    close() {
        this.socket.destroy();
        this.socket.emit("close");
    }
}
