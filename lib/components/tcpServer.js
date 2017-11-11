var nowFileName = "tcpServer.js";
var net = require("net");
var msgCoder = require("./msgCoder.js");
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var app = require("../mydog.js").app;


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
    this.socket.on("data", function (data) {
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
util.inherits(netsocket, EventEmitter);


netsocket.prototype.send = function (data) {
    this.socket.write(data);
};

netsocket.prototype.close = function () {
    this.socket.destroy();
    this.socket.emit("close");
};
