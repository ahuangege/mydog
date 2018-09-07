var nowFileName = __filename;
var tcpClient = require("./tcpClient.js");
var define = require("../util/define.js");

var app = null;
var clients = {};
var router = null;

var remoteFrontend = module.exports;

remoteFrontend.init = function (_app) {
    app = _app;
    router = app.router;
    app.remoteFrontend = this;
};

remoteFrontend.addServer = function (server) {
    if (clients[server.serverType] && clients[server.serverType][server.serverInfo.id]) {
        return;
    }
    if (!clients[server.serverType]) {
        clients[server.serverType] = {};
    }
    var client = {
        "id": server.serverInfo.id,
        "host": server.serverInfo.host,
        "port": server.serverInfo.port,
        "serverType": server.serverType,
        "timer": null,
        "socket": null
    };
    clients[server.serverType][server.serverInfo.id] = client;
    doConnect(client, 0);
};

remoteFrontend.removeServer = function (serverInfo) {
    if (clients[serverInfo.serverType] && clients[serverInfo.serverType][serverInfo.id]) {
        var client = clients[serverInfo.serverType][serverInfo.id];
        if (client.socket) {
            client.socket.close();
        }
        clearTimeout(client.timer);
        delete clients[serverInfo.serverType][serverInfo.id];
    }
};


/**
 *      [4]       [1]         [2]         [...]        [....]
 *    allMsgLen  msgType   sessionLen   sessionBuf  clientMsgBuf
 */


remoteFrontend.doRemote = function (msgBuf, session, serverType) {
    if (!clients[serverType]) {
        app.logger(nowFileName, "error", "- " + app.serverId + " has no backend serverType: " + serverType);
        return;
    }
    var tmpRouter = router[serverType];
    if (!tmpRouter) {
        tmpRouter = defaultRoute;
    }
    tmpRouter(app, session, serverType, function (err, sid) {
        if (err) {
            app.logger(nowFileName, "error", err);
            return;
        }
        var client = clients[serverType][sid];
        if (!client || !client.socket) {
            app.logger(nowFileName, "error", "- " + app.serverId + " has no backend server " + sid);
            return;
        }
        var sessionBuf = Buffer.from(JSON.stringify(session.getAll()));
        var buf = Buffer.allocUnsafe(7 + sessionBuf.length + msgBuf.length);
        buf.writeUInt32BE(3 + sessionBuf.length + msgBuf.length);
        buf.writeUInt8(define.Front_To_Back.msg, 4);
        buf.writeUInt16BE(sessionBuf.length, 5);
        sessionBuf.copy(buf, 7);
        msgBuf.copy(buf, 7 + sessionBuf.length);
        client.socket.send(buf);
    });
};

function doConnect(client, delay) {

    client.socket = null;
    client.timer = setTimeout(function () {
        var connectCb = function () {
            app.logger(nowFileName, "debug", "- " + app.serverId + " remote connect to " + client.id);

            client.socket = tmpClient;

            // 注册
            var loginBuf = Buffer.from(JSON.stringify({
                sid: app.serverId,
                serverToken: app.serverToken
            }));
            var buf = Buffer.allocUnsafe(loginBuf.length + 5);
            buf.writeUInt32BE(loginBuf.length + 1);
            buf.writeUInt8(define.Front_To_Back.register, 4);
            loginBuf.copy(buf, 5);
            tmpClient.send(buf);

            //心跳包
            heartBeat(tmpClient);
        };
        var tmpClient = new tcpClient(client.port, client.host, connectCb);
        tmpClient.on("data", data_Switch);
        tmpClient.on("close", function () {
            clearTimeout(tmpClient.heartBeatTimer);
            app.logger(nowFileName, "error", "- " + app.serverId + " remote connect fail " + client.id + " -- reconnect " + define.Time.Remote_Reconnect_Time + "s later");
            doConnect(client, define.Time.Remote_Reconnect_Time * 1000);
        });

    }, delay);
}


function heartBeat(socket) {
    socket.heartBeatTimer = setTimeout(function () {
        var buf = Buffer.allocUnsafe(5);
        buf.writeUInt32BE(1);
        buf.writeUInt8(define.Front_To_Back.heartbeat, 4);
        socket.send(buf);
        heartBeat(socket);
    }, define.Time.Remote_Heart_Beat_Time * 1000)
}


var defaultRoute = function (app, session, serverType, cb) {
    var list = app.getServersByType(serverType);
    if (!list || !list.length) {
        cb(app.serverId + " has no such serverType: " + serverType);
        return;
    }
    var index = session.uid.toString().length % list.length;
    cb(null, list[index].id);
};


function data_Switch(msg) {
    var type = msg.readUInt8();
    if (type === define.Back_To_Front.msg) {
        msg_handle(msg);
    } else if (type === define.Back_To_Front.applySession) {
        applySession_handle(msg);
    }
}

function msg_handle(data) {
    var uidsBufLen = data.readUInt16BE(1);
    var uids = JSON.parse(data.slice(3, 3 + uidsBufLen));
    var msgBuf = data.slice(3 + uidsBufLen);

    var clients = app.clients;
    var client = null;
    for (var i = 0; i < uids.length; i++) {
        client = clients[uids[i]];
        if (client) {
            client.socket.send(msgBuf);
        }
    }
}

function applySession_handle(data) {
    var session = JSON.parse(data.slice(1));
    app.applySession(session.uid, session);
}

