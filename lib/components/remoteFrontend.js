var nowFileName = "remoteFrontend.js";
var tcpClient = require("./tcpClient.js");
var msgCoder = require("./msgCoder.js");
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

remoteFrontend.doRemote = function (cmd, msg, session, serverType) {
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
            app.logger(nowFileName, "error", "- " + app.serverId + " has no backend serverType " + serverType);
            return;
        }
        var client = clients[serverType][sid];
        if (!client || !client.socket) {
            app.logger(nowFileName, "error", "- " + app.serverId + " has no backend server " + sid);
            return;
        }
        var data = {
            "T": 1,
            "cmd": cmd,
            "msg": msg,
            "session": session.getAll()
        };
        data = msgCoder.encodeInnerData(data);
        client.socket.send(data);
    });
};

function doConnect(client, delay) {

    client.socket = null;
    client.timer = setTimeout(function () {
        var connectCb = function () {
            app.logger(nowFileName, "debug", "- " + app.serverId + " remote connect to " + client.id);

            client.socket = tmpClient;

            var loginInfo = {
                T: 2,
                sid: app.serverId,
                serverToken: app.serverToken
            };
            loginInfo = msgCoder.encodeInnerData(loginInfo);
            tmpClient.send(loginInfo);
        };
        var tmpClient = new tcpClient(client.port, client.host, connectCb);
        tmpClient.on("data", function (data) {
            dealMsg(JSON.parse(data));
        });
        tmpClient.on("close", function () {
            app.logger(nowFileName, "error", "- " + app.serverId + " remote connect fail " + client.id + " -- reconnect " + define.TIME.REMOTE_RECONNECT + "s later");
            doConnect(client, define.TIME.REMOTE_RECONNECT * 1000);
        });

    }, delay);
}


var defaultRoute = function (app, session, serverType, cb) {
    var list = app.getServersByType(serverType);
    if (!list.length) {
        cb(new Error("no such serverType: " + serverType));
        return;
    }
    var index = session.uid.toString().length % list.length;
    cb(null, list[index].id);
};


function dealMsg(msg) {
    if (msg.T === 1) {
        app.sendMsgByUid2(msg.cmd, msg.msg, msg.uids);
    } else if (msg.T === 2) {
        app.applySession(msg.uid, msg.session);
    }
}
