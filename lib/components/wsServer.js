"use strict";
/**
 * websocket通用服务端
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    }
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var events_1 = require("events");
var msgCoder_1 = require("./msgCoder");
var ws = require("ws");
function wsServer(port, startCb, newClientCb) {
    var server = new ws.Server({ "port": port }, startCb);
    server.on("connection", function (socket) {
        newClientCb(new WsSocket(socket));
    });
}
exports.default = wsServer;
var WsSocket = /** @class */ (function (_super) {
    __extends(WsSocket, _super);
    function WsSocket(socket) {
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
                _this.close();
            }
        });
        return _this;
    }
    WsSocket.prototype.send = function (data) {
        this.socket.send(data);
    };
    WsSocket.prototype.close = function () {
        this.socket.close();
        this.socket.emit("close");
    };
    return WsSocket;
}(events_1.EventEmitter));
