"use strict";
/**
 * tcp通用客户端
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
exports.TcpClient = void 0;
const net = __importStar(require("net"));
const events_1 = require("events");
const msgCoder_1 = require("./msgCoder");
class TcpClient extends events_1.EventEmitter {
    constructor(port, host, maxLen, noDelay, connectCb) {
        super();
        this.die = false;
        this.remoteAddress = "";
        this.len = 0;
        this.buffer = Buffer.allocUnsafe(0);
        this.socket = net.connect(port, host, () => {
            this.remoteAddress = this.socket.remoteAddress;
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
exports.TcpClient = TcpClient;
