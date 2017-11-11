var nowFileName = "backendServer.js";
var fs = require("fs");
var path = require("path");
var tcpServer = require("./tcpServer.js");
var Session = require("./session.js");
var msgCoder = require("./msgCoder.js");
var define = require("../util/define.js");

var app = null;
var routeConfig = null;
var msgHandler = {};

module.exports.start = function (_app) {
    app = _app;
    routeConfig = app.routeConfig;
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
        socket.on('data', function (data) {
            dealMsg(socket, session, data);
        });
        socket.on('close', function () {
            socketClose(socket);
        });

        socket.timer = setTimeout(function () {
            app.logger(nowFileName, "error", "- " + app.serverId + " : register time out");
            socket.close();
        }, 5000);

    };
    var server = new tcpServer(app.port, startCb, newClientCb);
}

function socketClose(socket) {
    clearTimeout(socket.timer);
    if (socket.sid) {
        app.remoteBackend.removeClient(socket.sid);
    }
}

function dealMsg(socket, session, msg) {
    try {
        msg = JSON.parse(msg);
    } catch (err) {
        app.logger(nowFileName, "error", "- JSON parse error, close the socket");
        socket.close();
        return;
    }

    if (msg.T === 1) {
        var cmd = routeConfig[msg.cmd];
        var cmdArr = cmd.split('.');
        session.setAll(msg.session);
        msgHandler[cmdArr[1]][cmdArr[2]](msg.msg, session, callBack(socket, msg.cmd, session.uid));
    } else if (msg.T === 2) {
        if (msg.serverToken !== app.serverToken) {
            app.logger(nowFileName, "error", "- illegal token, close the socket");
            socket.close();
            return;
        }
        clearTimeout(socket.timer);
        app.remoteBackend.addClient(msg.sid, socket);
    } else {
        app.logger(nowFileName, "error", "- illegal data, close the socket");
    }
}


function callBack(socket, cmd, uid) {
    return function (msg) {
        var data = {
            "T": 1,
            "uids": [uid],
            "cmd": cmd,
            "msg": msg
        };
        data = msgCoder.encodeInnerData(data);
        socket.send(data);
    }
}