var nowFileName = "tcpClient.js";
var net = require("net");
var msgCoder = require("./msgCoder.js");
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var app = require("../mydog.js").app;

var tcpClient = function (port, host, connectCb) {
    var self = this;
    self.die = false;
    self.msgBuf = {"len": 0, "buffer": new Buffer(0)};
    self.client = net.connect(port, host, connectCb);
    self.client.on('close', function () {
        if (!self.die) {
            self.die = true;
            self.emit("close");
        }
    });
    self.client.on('error', function () {
        if (!self.die) {
            self.die = true;
            self.emit("close");
        }
    });
    self.client.on('data', function (data) {
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
util.inherits(tcpClient, EventEmitter);

module.exports = tcpClient;


tcpClient.prototype.send = function (data) {
    this.client.write(data);
};

tcpClient.prototype.close = function () {
    this.client.destroy();
    this.client.emit("close");
};
