var webSocket = require("ws");
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var msgCoder = require("./msgCoder.js");


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
    this.len = 0;
    this.buffer = Buffer.allocUnsafe(0);

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
            msgCoder.decode(self, data);
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
