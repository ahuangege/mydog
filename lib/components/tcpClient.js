var net = require("net");
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var msgCoder = require("./msgCoder.js");


var tcpClient = function (port, host, connectCb) {
    this.die = false;
    this.len = 0;
    this.buffer = Buffer.allocUnsafe(0);

    this.client = net.connect(port, host, connectCb);
    var self = this;
    this.client.on('close', function () {
        if (!self.die) {
            self.die = true;
            self.emit("close");
        }
    });
    this.client.on('error', function () {
        if (!self.die) {
            self.die = true;
            self.emit("close");
        }
    });
    this.client.on('data', function (data) {
        if (self.die) {
            self.close();
        } else {
            msgCoder.decode(self, data);
        }
    });
};
util.inherits(tcpClient, EventEmitter);

module.exports = tcpClient;


tcpClient.prototype.send = function (data) {
    this.client.write(data);
};

tcpClient.prototype.close = function () {
    this.client.destroy();
    this.client.emit("close");
};
