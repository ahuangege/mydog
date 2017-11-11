var nowFileName = "master.js";
var tcpServer = require("./tcpServer.js");
var starter = require("../util/starter.js");
var msgCoder = require("./msgCoder.js");

var servers = {};
var app = null;

module.exports.start = function (_app) {
    app = _app;
    startServer();
};

function startServer() {
    var startCb = function () {
        console.info("- server start: " + app.port + " / " + app.serverId);
        if (app.startMode === "all") {
            starter.runServers(app);
        }
    };
    var newClientCb = function (socket) {

        socket.on('data', function (data) {
            dealMsg(data, socket);
        });
        socket.on('close', function () {
            socketClose(socket);
        });

        socket.timer = setTimeout(function () {
            app.logger(nowFileName, "error", "- master : register time out");
            socket.close();
        }, 5000);
    };
    var server = new tcpServer(app.port, startCb, newClientCb);
}

function socketClose(socket) {
    clearTimeout(socket.timer);
    if (socket.sid) {
        delete servers[socket.sid];
        var serverInfo = {
            "T": 2,
            "id": socket.sid,
            "serverType": socket.serverType,
            "frontend": socket.serverInfo.frontend
        };
        serverInfo = msgCoder.encodeInnerData(serverInfo);
        for (var sid in servers) {
            if (servers[sid].serverType !== "rpc") {
                servers[sid].send(serverInfo);
            }
        }
        app.logger(nowFileName, "info", "- the socket connected to master disconnect : " + socket.sid);
    }
}


function dealMsg(data, socket) {
    try {
        data = JSON.parse(data);
    } catch (err) {
        app.logger(nowFileName, "error", "- JSON parse error，close the socket");
        socket.close();
        return;
    }

    if (data.T === 1) { //register message
        register(data, socket);
    } else {
        app.logger(nowFileName, "error", "- illegal data, close the socket");
        socket.close();
    }
}

function register(data, socket) {
    if (data.serverToken !== app.serverToken) {
        app.logger(nowFileName, "error", "- illegal token, close the socket");
        socket.close();
        return;
    }
    if (!!servers[data.serverInfo.id]) {
        app.logger(nowFileName, "error", "- master already has " + data.serverInfo.id + ", close it");
        socket.close();
        return;
    }
    clearTimeout(socket.timer);

    socket.sid = data.serverInfo.id;
    socket.serverType = data.serverType;
    socket.serverInfo = data.serverInfo;
    servers[socket.sid] = socket;

    var socketInfo = {
        "T": 1,
        "serverInfo": {}
    };
    socketInfo.serverInfo[socket.sid] = {
        "serverType": socket.serverType,
        "serverInfo": socket.serverInfo
    };
    socketInfo = msgCoder.encodeInnerData(socketInfo);

    var result = {"T": 1};
    var serverInfo = {};
    var server;
    for (var sid in servers) {
        server = servers[sid];
        if (sid !== socket.sid) {
            serverInfo[sid] = {
                "serverType": server.serverType,
                "serverInfo": server.serverInfo
            };
            if (server.serverType !== "rpc") {
                server.send(socketInfo);
            }
        }
    }
    result.serverInfo = serverInfo;
    if (socket.serverType !== "rpc") {
        result = msgCoder.encodeInnerData(result);
        socket.send(result);
    }
    app.logger(nowFileName, "debug", "- master get new socket: " + socket.sid);
}