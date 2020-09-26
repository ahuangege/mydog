"use strict";
/**
 * websocket通用服务端
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
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
var events_1 = require("events");
var ws = __importStar(require("ws"));
var define_1 = require("../util/define");
function wsServer(port, startCb, newClientCb) {
    var server = new ws.Server({ "port": port, "maxPayload": define_1.some_config.SocketBufferMaxLenUnregister }, startCb);
    server.on("connection", function (socket, req) {
        newClientCb(new WsSocket(socket, req.connection.remoteAddress));
    });
    server.on("error", function (err) {
        console.log(err);
        process.exit();
    });
    server.on("close", function () { });
}
exports.default = wsServer;
var WsSocket = /** @class */ (function (_super) {
    __extends(WsSocket, _super);
    function WsSocket(socket, remoteAddress) {
        var _this = _super.call(this) || this;
        _this.die = false;
        _this.remoteAddress = "";
        _this.maxLen = 0;
        _this.len = 0;
        _this.buffer = Buffer.allocUnsafe(0);
        _this.socket = socket;
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
