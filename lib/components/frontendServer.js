var nowFileName = __filename;
var fs = require("fs");
var path = require("path");
var tcpServer = require("./tcpServer.js");
var wsServer = require("./wsServer.js");
var Session = require("./session.js");
var msgCoder = require("./msgCoder.js");
var define = require("../util/define.js");

var app = null;
var serverType = null;
var routeConfig = null;
var handshakeBuf = null;
var msgHandler = {};
var decode = null;
var client_heartbeat_time = 0;

module.exports.start = function (_app, cb) {
    app = _app;
    serverType = app.serverType;
    routeConfig = app.routeConfig;
    var connectorConfig = app.get("connectorConfig");
    if (connectorConfig) {
        if (connectorConfig.hasOwnProperty("heartbeat") && connectorConfig.heartbeat >= 5) {
            client_heartbeat_time = connectorConfig.heartbeat * 1000;
        }
    }
    var encodeDecodeConfig = app.get("encodeDecodeConfig");
    if (encodeDecodeConfig) {
        decode = encodeDecodeConfig["decode"] || null;
        msgCoder.setEncode(encodeDecodeConfig.encode);
    }

    // 握手buffer
    var routeBuf = Buffer.from(JSON.stringify({"route": routeConfig, "heartbeat": client_heartbeat_time / 1000}));
    handshakeBuf = Buffer.alloc(routeBuf.length + 5);
    handshakeBuf.writeUInt32BE(routeBuf.length + 1);
    handshakeBuf.writeUInt8(define.Server_To_Client.handshake, 4);
    routeBuf.copy(handshakeBuf, 5);

    loadHandler();
    startServer(cb);
};

/**
 * 前端服务器加载路由处理
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
 * 启动服务器，监听端口
 */
function startServer(cb) {
    var startCb = function () {
        console.log("server start: " + app.host + ":" + app.port + " / " + app.serverId);
        cb && cb();
    };
    var newClientCb = function (socket) {
        var session = new Session();
        session.sid = app.serverId;
        session.socket = socket;
        session.registered = false;
        session.heartbeat_timer = null;
        app.clientNum++;
        heartbeat_handle(session);
        socket.on('data', data_Switch.bind(session));
        socket.on('close', socketClose.bind(session));
    };

    var configType = "";
    if (app.get("connectorConfig")) {
        configType = app.get("connectorConfig").connector;
    }
    configType = configType === define.Connector.Ws ? define.Connector.Ws : define.Connector.Net;

    if (configType === define.Connector.Ws) {
        new wsServer(app.port, startCb, newClientCb);
    } else {
        new tcpServer(app.port, startCb, newClientCb);
    }
}

/**
 * 客户端断开连接
 * @param session
 */
function socketClose() {
    delete app.clients[this.uid];
    app.clientNum--;
    clearTimeout(this.heartbeat_timer);
    if (this._onclosed) {
        this._onclosed(app, this);
    }
}

/**
 * 收到客户端消息
 * @param data
 */
function data_Switch(data) {
    var type = data.readUInt8();
    if (type === define.Client_To_Server.msg) {               // 普通的自定义消息
        msg_handle(this, data);
    } else if (type === define.Client_To_Server.heartbeat) {        // 心跳
        heartbeat_handle(this);
    } else if (type === define.Client_To_Server.handshake) {        // 握手
        handshake_handle(this);
    } else {
        this.socket.close();
    }
}

/**
 * 握手
 * @param session
 */
function handshake_handle(session) {
    if (session.registered) {
        session.socket.close();
        return;
    }
    session.registered = true;
    session.socket.send(handshakeBuf);
}

/**
 * 心跳
 * @param session
 */
function heartbeat_handle(session) {
    if (client_heartbeat_time === 0) {
        return;
    }
    clearTimeout(session.heartbeat_timer);
    session.heartbeat_timer = setTimeout(function () {
        session.socket.close();
    }, client_heartbeat_time * 2);
}

/**
 * 自定义消息
 * @param session
 * @param msg
 */
function msg_handle(session, msg) {
    if (!session.registered) {
        session.socket.close();
        return;
    }
    var cmdId = msg.readUInt8(1);
    var cmd = routeConfig[cmdId];
    if (!cmd) {
        app.logger(nowFileName, "error", "not find route index: " + cmdId);
        return;
    }

    var cmdArr = cmd.split('.');
    if (serverType === cmdArr[0]) {
        if (decode) {
            msg = decode(cmdId, msg.slice(2));
        } else {
            try {
                msg = JSON.parse(msg.slice(2));
            } catch (err) {
                app.logger(nowFileName, "error", "JSON parse error, close the socket");
                session.socket.close();
                return;
            }
        }
        msgHandler[cmdArr[1]][cmdArr[2]](msg, session, callBack(session.socket, cmdId));
    } else {
        app.remoteFrontend.doRemote(msg.slice(1), session, cmdArr[0]);
    }
}

/**
 * 回调
 * @param socket
 * @param cmd
 * @returns {Function}
 */
function callBack(socket, cmd) {
    return function (msg) {
        if (msg === undefined) {
            msg = null;
        }
        msg = msgCoder.encodeClientData(cmd, msg);
        socket.send(msg);
    }
}
