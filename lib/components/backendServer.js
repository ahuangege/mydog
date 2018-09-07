var nowFileName = __filename;
var fs = require("fs");
var path = require("path");
var tcpServer = require("./tcpServer.js");
var Session = require("./session.js");
var msgCoder = require("./msgCoder.js");
var define = require("../util/define.js");

var app = null;
var routeConfig = null;
var msgHandler = {};
var decode = null;

module.exports.start = function (_app, cb) {
    app = _app;
    routeConfig = app.routeConfig;
    var encodeDecodeConfig = app.get("encodeDecodeConfig");
    if (encodeDecodeConfig) {
        decode = encodeDecodeConfig["decode"] || null;
        msgCoder.setEncode(encodeDecodeConfig["encode"]);
    }
    loadHandler();
    startServer(cb);
};

/**
 * 后端服务器加载路由处理
 */
function loadHandler() {
    var dirName = path.join(app.base, define.File_Dir.Servers, app.serverType, "handler");
    var exists = fs.existsSync(dirName);
    if (exists) {
        fs.readdirSync(dirName).forEach(function (filename) {
            if (!/\.js$/.test(filename)) {
                return;
            }
            var name = path.basename(filename, '.js');
            var handler = require(path.join(dirName, filename));
            if (handler.default && typeof handler.default === "function") {
                msgHandler[name] = new handler.default(app);
            } else if (typeof handler === "function") {
                msgHandler[name] = new handler(app);
            }
        });
    }
}

/**
 * 服务器启动
 */
function startServer(cb) {
    var startCb = function () {
        console.log("server start: " + app.host + ":" + app.port + " / " + app.serverId);
        cb && cb();
    };
    var newClientCb = function (socket) {
        new SocketProxy(socket);
    };
    var server = new tcpServer(app.port, startCb, newClientCb);
}

/**
 * socket连接代理
 */
function SocketProxy(socket) {
    this.socket = socket;
    socket.on('data', this.onData.bind(this));
    socket.on('close', this.onClose.bind(this));
    this.heartBeatTimer = null;
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
    if (type === define.Front_To_Back.msg) {
        this.msg_handle(data);
    } else if (type === define.Front_To_Back.register) {
        this.register_handle(data);
    } else if (type === define.Front_To_Back.heartbeat) {
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
    if (this.socket.sid) {
        app.remoteBackend.removeClient(this.socket.sid);
    }
};

/**
 * 前端服务器注册
 * @param data
 */
SocketProxy.prototype.register_handle = function (data) {
    try {
        data = JSON.parse(data.slice(1));
    } catch (err) {
        this.socket.close();
        return;
    }
    if (data.serverToken !== app.serverToken) {
        app.logger(nowFileName, "error", "- illegal token, close the socket");
        this.socket.close();
        return;
    }
    clearTimeout(this.registerTimer);
    app.remoteBackend.addClient(data.sid, this.socket);
};

/**
 * 心跳
 */
SocketProxy.prototype.heartBeat_handle = function () {
    var self = this;
    clearTimeout(this.heartBeatTimer);
    this.heartBeatTimer = setTimeout(function () {
        app.logger(nowFileName, "error", "- heartBeat time out", self.sid);
        self.socket.close();
    }, define.Time.Remote_Heart_Beat_Time * 1000 * 2);
};

/**
 * 收到前端服务器消息
 * @param msgBuf
 */
SocketProxy.prototype.msg_handle = function (msgBuf) {
    var sessionLen = msgBuf.readUInt16BE(1);
    var sessionBuf = msgBuf.slice(3, 3 + sessionLen);
    var session = new Session();
    session.setAll(JSON.parse(sessionBuf));

    var cmdId = msgBuf.readUInt8(3 + sessionLen);
    var cmd = routeConfig[cmdId];
    var cmdArr = cmd.split('.');
    var msg;
    if (decode) {
        msg = decode(cmdId, msgBuf.slice(4 + sessionLen));
    } else {
        try {
            msg = JSON.parse(msgBuf.slice(4 + sessionLen));
        } catch (err) {
            app.logger(nowFileName, "error", "- JSON parse error");
            return;
        }
    }
    msgHandler[cmdArr[1]][cmdArr[2]](msg, session, callBack(this, cmdId, session.uid));
};

/**
 * 回调
 * @param socket
 * @param cmdId
 * @param uid
 * @returns {Function}
 */
function callBack(socket, cmdId, uid) {
    return function (msg) {
        if (msg === undefined) {
            msg = null;
        }
        var buf = msgCoder.encodeRemoteData([uid], cmdId, msg);
        socket.send(buf);
    }
}