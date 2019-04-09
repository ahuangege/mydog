"use strict";
/**
 * tcp通用服务端
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
var net = __importStar(require("net"));
var events_1 = require("events");
var msgCoder_1 = require("./msgCoder");
function tcpServer(port, startCb, newClientCb) {
    net.createServer(function (socket) {
        newClientCb(new NetSocket(socket));
    }).listen(port, startCb);
}
exports.default = tcpServer;
var NetSocket = /** @class */ (function (_super) {
    __extends(NetSocket, _super);
    function NetSocket(socket) {
        var _this = _super.call(this) || this;
        _this.die = false;
        _this.len = 0;
        _this.buffer = Buffer.allocUnsafe(0);
        _this.socket = socket;
        socket.on("close", function (err) {
            if (!_this.die) {
                _this.die = true;
                _this.emit("close", err);
            }
        });
        socket.on("error", function (err) {
            if (!_this.die) {
                _this.die = true;
                _this.emit("close", err);
            }
        });
        socket.on("data", function (data) {
            if (!_this.die) {
                msgCoder_1.decode(_this, data);
            }
            else {
                self.close();
            }
        });
        return _this;
    }
    NetSocket.prototype.send = function (data) {
        this.socket.write(data);
    };
    NetSocket.prototype.close = function () {
        this.socket.destroy();
        this.socket.emit("close");
    };
    return NetSocket;
}(events_1.EventEmitter));
