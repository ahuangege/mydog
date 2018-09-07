var nowFileName = __filename;
var tcpServer = require("./tcpServer.js");
var define = require("../util/define.js");


var servers = {};
var app = null;

module.exports.start = function (_app, cb) {
    app = _app;
    var startCb = function () {
        console.log("server start: " + app.host + ":" + app.port + " / " + app.serverId);
        cb && cb();
    };
    var newClientCb = function (socket) {
        new SocketProxy(socket);
    };
    new tcpServer(app.port, startCb, newClientCb);
};


// socket连接代理
function SocketProxy(socket) {
    this.socket = socket;
    this.sid = "";
    socket.on('data', this.onData.bind(this));
    socket.on('close', this.onClose.bind(this));
    this.heartBeatTimer = null;
    this.registered = false;
    this.registerTimer = setTimeout(function () {
        app.logger(nowFileName, "error", "- " + app.serverId + " : register time out");
        socket.close();
    }, 10000);

    this.heartBeat_handle();
}


/**
 * 发送消息
 * @param data
 */
SocketProxy.prototype.send = function (data) {
    this.socket.send(data);
};

/**
 * socket收到数据了
 * @param data
 */
SocketProxy.prototype.onData = function (data) {
    var type = data.readUInt8();
    if (type === define.Rpc_Msg.msg) {
        this.msg_handle(data);
    } else if (type === define.Rpc_Msg.register) {
        this.register_handle(data);
    } else if (type === define.Rpc_Msg.heartbeat) {
        this.heartBeat_handle();
    } else {
        app.logger(nowFileName, "error", "- illegal data, close the socket");
        this.socket.close();
    }
};

/**
 * socket连接关闭了
 */
SocketProxy.prototype.onClose = function () {
    clearTimeout(this.registerTimer);
    clearTimeout(this.heartBeatTimer);
    if (this.sid) {
        delete servers[this.sid];
        app.logger(nowFileName, "info", "- the socket connected to " + app.serverId + " disconnect : " + this.sid);
    }
};

/**
 * 注册
 * @param data
 */
SocketProxy.prototype.register_handle = function (data) {
    try {
        data = JSON.parse(data.slice(1));
    } catch (err) {
        app.logger(nowFileName, "error", "- JSON parse error，close the socket");
        this.socket.close();
        return;
    }

    if (data.serverToken !== app.serverToken) {
        app.logger(nowFileName, "error", "- illegal token, close the socket");
        this.socket.close();
        return;
    }
    if (!!servers[data.sid]) {
        app.logger(nowFileName, "error", "- " + app.serverId + " : already has  " + data.sid);
        this.socket.close();
        return;
    }
    clearTimeout(this.registerTimer);
    this.registered = true;
    this.sid = data.sid;
    servers[this.sid] = this;
    app.logger(nowFileName, "debug", "- " + app.serverId + " : get new socket  " + this.sid);

};

/**
 * 心跳
 */
SocketProxy.prototype.heartBeat_handle = function () {
    var self = this;
    clearTimeout(this.heartBeatTimer);
    this.heartBeatTimer = setTimeout(function () {
        app.logger(nowFileName, "error", "- rpcServer : heartBeat time out", self.sid);
        self.socket.close();
    }, define.Time.Rpc_Heart_Beat_Time * 1000 * 2);
};

/**
 * 中转rpc消息
 * @param msgBuf
 */
SocketProxy.prototype.msg_handle = function (msgBuf) {
    if (!this.registered) {
        return;
    }
    var iMsgLen = msgBuf.readUInt8(1);
    var data = JSON.parse(msgBuf.slice(2, 2 + iMsgLen));
    var server = servers[data.to];
    var buffer;
    if (server) {
        buffer = Buffer.allocUnsafe(msgBuf.length + 3);
        buffer.writeUInt32BE(msgBuf.length - 1);
        msgBuf.copy(buffer, 4, 1);
        server.send(buffer);
    } else if (data.id && data.from) {
        var iMsgBuf = Buffer.from(JSON.stringify({
            "id": data.id,
            "err": {"code": 3, "info": "rpc server has no socket named :" + data.to}
        }));
        msgBuf = Buffer.from(JSON.stringify(null));
        buffer = Buffer.allocUnsafe(5 + iMsgBuf.length + msgBuf.length);
        buffer.writeUInt32BE(iMsgBuf.length + msgBuf.length + 1);
        buffer.writeUInt8(iMsgBuf.length, 4);
        iMsgBuf.copy(buffer, 5);
        msgBuf.copy(buffer, 5 + iMsgBuf.length);
        this.send(buffer);
    }
};