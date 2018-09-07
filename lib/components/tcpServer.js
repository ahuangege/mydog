var net = require("net");
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var msgCoder = require("./msgCoder.js");


var tcpServer = function (port, startCb, newClientCb) {
    var server = net.createServer(function (socket) {
        newClientCb(new netsocket(socket));
    });
    server.listen(port, startCb);
};

module.exports = tcpServer;


var netsocket = function (socket) {
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
    this.socket.on("data", function (data) {
        if (self.die) {
            self.close();
        } else {
            msgCoder.decode(self, data);
        }
    });
};
util.inherits(netsocket, EventEmitter);

netsocket.prototype.send = function (data) {
    this.socket.write(data);
};

netsocket.prototype.close = function () {
    this.socket.destroy();
    this.socket.emit("close");
};
