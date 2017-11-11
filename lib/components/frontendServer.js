var nowFileName = "frontendServer.js";
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
var msgHandler = {};
var decode = null;

module.exports.start = function (_app) {
    app = _app;
    serverType = app.serverType;
    routeConfig = app.routeConfig;
    var connectorConfig = app.get("connectorConfig");
    if (connectorConfig) {
        decode = connectorConfig.decode;
        msgCoder.setClientEncode(connectorConfig.encode);
    }
    loadHandler();
    startServer();
};

function loadHandler() {
    var dirName = path.join(app.base, define.FILE_DIR.SERVERS, app.serverType, "handler");
    var exists = fs.existsSync(dirName);
    if (exists) {
        fs.readdirSync(dirName).forEach(function (filename) {
            if (!/\.js$/.test(filename)) {
                return;
            }
            var name = path.basename(filename, '.js');
            var handler = require(path.join(dirName, filename));
            msgHandler[name] = handler(app);
        });
    }
}

function startServer() {
    var startCb = function () {
        console.info("- server start: " + app.port + " / " + app.serverId);
    };
    var newClientCb = function (socket) {

        var session = new Session();
        session.sid = app.serverId;
        session.socket = socket;
        app.clientNum++;

        socket.on('data', function (data) {
            dealMsg(socket, session, data);
        });
        socket.on('close', function () {
            socketClose(session);
        });
    };


    var configType = "";
    if (app.get("connectorConfig")) {
        configType = app.get("connectorConfig").connector;
    }
    configType = configType === define.CONNECTOR.WS ? define.CONNECTOR.WS : define.CONNECTOR.NET;

    if (configType === define.CONNECTOR.WS) {
        new wsServer(app.port, startCb, newClientCb);
    } else {
        new tcpServer(app.port, startCb, newClientCb);
    }
}

function socketClose(session) {
    delete app.clients[session.uid];
    app.clientNum--;
    if (session._onclosed) {
        session._onclosed(session);
    }
}

function dealMsg(socket, session, msg) {

    var cmdId = msg.readUInt8();
    var cmd = routeConfig[cmdId];
    if (!cmd) {
        app.logger(nowFileName, "error", "- not find route index: " + cmdId);
        return;
    }

    if (app.ifLogRoute) {
        console.log("--- --- " + cmd);
    }

    if (decode) {
        msg = decode(cmdId, msg.slice(1));
    } else {
        try {
            msg = JSON.parse(msg.slice(1));
        } catch (err) {
            app.logger(nowFileName, "error", "- JSON parse error, close the socket");
            socket.close();
            return;
        }
    }


    var cmdArr = cmd.split('.');
    if (serverType === cmdArr[0]) {
        msgHandler[cmdArr[1]][cmdArr[2]](msg, session, callBack(socket, cmdId));
    } else {
        app.remoteFrontend.doRemote(cmdId, msg, session, cmdArr[0]);
    }
}

function callBack(socket, cmd) {
    return function (msg) {
        msg = msgCoder.encodeClientData(cmd, msg);
        socket.send(msg);
    }
}
