var nowFileName = "wsServer.js";
var webSocket = require("ws");
var msgCoder = require("./msgCoder.js");
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var app = require("../mydog.js").app;

//websocket为应用层协议，已经处理粘包问题，但此处仍然再次解析，另并没有合并到tcpServer中。

var wsServer = function (port, startCb, newClientCb) {
    var server = new webSocket.Server({"port": port}, startCb);
    server.on("connection", function (socket) {
        newClientCb(new wssocket(socket));
    });
};

module.exports = wsServer;


var wssocket = function (socket) {
    this.die = false;
    this.socket = socket;
    this.msgBuf = {"len": 0, "buffer": new Buffer(0)};
    var self = this;
    this.socket.on("close", function () {
        if (!self.die) {
            self.die = true;
            self.emit("close");
        }
    });
    this.socket.on("error", function () {
        if (!self.die) {
            self.die = true;
            self.emit("close");
        }
    });
    this.socket.on("message", function (data) {
        if (self.die) {
            self.close();
        } else {
            msgCoder.decode(self.msgBuf, data, function (err, msg) {
                if (err) {
                    app.logger(nowFileName, "error", "- data too long, close the socket");
                    self.close();
                } else {
                    self.emit("data", msg);
                }
            });
        }
    });
};

util.inherits(wssocket, EventEmitter);


wssocket.prototype.send = function (data) {
    this.socket.send(data);
};

wssocket.prototype.close = function () {
    this.socket.close();
    this.socket.emit("close");
};
