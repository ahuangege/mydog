"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var tcpServer_1 = __importDefault(require("../components/tcpServer"));
/**
 * connector  tcp
 */
var ConnectorTcp = /** @class */ (function () {
    function ConnectorTcp(info) {
        this.clientManager = null;
        this.heartbeatTime = 0; // 心跳时间
        this.app = info.app;
        this.clientManager = info.clientManager;
        tcpServer_1.default(info.app.clientPort, info.config.maxLen, info.startCb, this.newClientCb.bind(this));
        // 心跳时间
        this.heartbeatTime = info.config.heartbeat * 1000;
        // 握手buffer
        var routeBuf = Buffer.from(JSON.stringify({ "route": info.config.route, "heartbeat": this.heartbeatTime / 1000 }));
        this.handshakeBuf = Buffer.alloc(routeBuf.length + 5);
        this.handshakeBuf.writeUInt32BE(routeBuf.length + 1, 0);
        this.handshakeBuf.writeUInt8(2 /* handshake */, 4);
        routeBuf.copy(this.handshakeBuf, 5);
        // 心跳回应buffer
        this.heartbeatBuf = Buffer.alloc(5);
        this.heartbeatBuf.writeUInt32BE(1, 0);
        this.heartbeatBuf.writeUInt8(3 /* heartbeatResponse */, 4);
    }
    ConnectorTcp.prototype.newClientCb = function (socket) {
        new ClientSocket(this, this.clientManager, socket);
    };
    return ConnectorTcp;
}());
exports.ConnectorTcp = ConnectorTcp;
var ClientSocket = /** @class */ (function () {
    function ClientSocket(connector, clientManager, socket) {
        var _this = this;
        this.session = null; // Session
        this.remoteAddress = "";
        this.handshakeOver = false; // 是否已经握手成功
        this.registerTimer = null; // 握手超时计时
        this.heartbeatTimer = null; // 心跳超时计时
        this.connector = connector;
        this.clientManager = clientManager;
        this.socket = socket;
        this.remoteAddress = socket.remoteAddress;
        socket.on('data', this.onData.bind(this));
        socket.on('close', this.onClose.bind(this));
        this.registerTimer = setTimeout(function () {
            _this.close();
        }, 10000);
    }
    /**
     * 收到数据
     */
    ClientSocket.prototype.onData = function (data) {
        var type = data.readUInt8(0);
        if (type === 1 /* msg */) { // 普通的自定义消息
            this.clientManager.handleMsg(this, data);
        }
        else if (type === 3 /* heartbeat */) { // 心跳
            this.heartbeat();
            this.heartbeatResponse();
        }
        else if (type === 2 /* handshake */) { // 握手
            this.handshake();
        }
        else {
            this.close();
        }
    };
    /**
     * 关闭了
     */
    ClientSocket.prototype.onClose = function () {
        clearTimeout(this.registerTimer);
        clearTimeout(this.heartbeatTimer);
        this.clientManager.removeClient(this);
    };
    /**
     * 握手
     */
    ClientSocket.prototype.handshake = function () {
        if (this.handshakeOver) {
            this.close();
            return;
        }
        this.handshakeOver = true;
        this.send(this.connector.handshakeBuf);
        clearTimeout(this.registerTimer);
        this.heartbeat();
        this.clientManager.addClient(this);
    };
    /**
     * 心跳
     */
    ClientSocket.prototype.heartbeat = function () {
        var _this = this;
        if (this.connector.heartbeatTime === 0) {
            return;
        }
        clearTimeout(this.heartbeatTimer);
        this.heartbeatTimer = setTimeout(function () {
            _this.close();
        }, this.connector.heartbeatTime * 2);
    };
    /**
     * 心跳回应
     */
    ClientSocket.prototype.heartbeatResponse = function () {
        this.send(this.connector.heartbeatBuf);
    };
    /**
     * 发送数据
     */
    ClientSocket.prototype.send = function (msg) {
        this.socket.send(msg);
    };
    /**
     * 关闭
     */
    ClientSocket.prototype.close = function () {
        this.socket.close();
    };
    return ClientSocket;
}());
