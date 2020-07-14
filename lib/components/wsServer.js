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
    };
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
var events_1 = require("events");
var ws = __importStar(require("ws"));
function wsServer(port, maxLen, startCb, newClientCb) {
    var server = new ws.Server({ "port": port }, startCb);
    server.on("connection", function (socket, req) {
        newClientCb(new WsSocket(socket, req.connection.remoteAddress, maxLen));
    });
    server.on("error", function (err) {
        console.log(err);
    });
    server.on("close", function () { });
}
exports.default = wsServer;
var WsSocket = /** @class */ (function (_super) {
    __extends(WsSocket, _super);
    function WsSocket(socket, remoteAddress, maxLen) {
        var _this = _super.call(this) || this;
        _this.die = false;
        _this.remoteAddress = "";
        _this.len = 0;
        _this.buffer = Buffer.allocUnsafe(0);
        _this.socket = socket;
        _this.maxLen = maxLen;
        _this.remoteAddress = remoteAddress;
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
        socket.on("message", function (data) {
            if (!_this.die) {
                _this.emit("data", data);
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
