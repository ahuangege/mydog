var nowFileName = "rpcServer.js";
var tcpServer = require("./tcpServer.js");
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
    };
    var newClientCb = function (socket) {
        socket.on('data', function (data) {
            dealMsg(data, socket);
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
        delete servers[socket.sid];
        app.logger(nowFileName, "info", "- the socket connected to " + app.serverId + " disconnect : " + socket.sid);
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

    if (data.T === 1) {   //rpc message
        if (servers[data.to]) {
            var msg = msgCoder.encodeInnerData(data);
            servers[data.to].send(msg);
        } else {
            app.logger(nowFileName, "error", "- rpc has no socket named :" + data.to);
            if (data.id && data.from) {
                var msg = msgCoder.encodeInnerData({
                    "T": 1,
                    "id": data.id,
                    "err": {"code": -3, "info": "rpc has no socket named :" + data.to}
                });
                socket.send(msg);
            }
        }
    } else if (data.T === 2) { //register message
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
    if (!!servers[data.sid]) {
        app.logger(nowFileName, "error", "- " + app.serverId + " : already has  " + data.sid);
        socket.close();
        return;
    }
    clearTimeout(socket.timer);
    socket.sid = data.sid;
    servers[socket.sid] = socket;
    app.logger(nowFileName, "debug", "- " + app.serverId + " : get new socket  " + socket.sid);

}