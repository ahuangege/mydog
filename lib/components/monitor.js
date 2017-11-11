var nowFileName = "monitor.js";
var tcpClient = require("./tcpClient.js");
var msgCoder = require("./msgCoder.js");
var define = require("../util/define.js");

var app = null;

module.exports.start = function (_app) {
    app = _app;
    connectToMaster(0);
};

function connectToMaster(delay) {
    setTimeout(function () {
        var master = app.master;
        var connectCb = function () {
            app.logger(nowFileName, "debug", "- " + app.serverId + " connected to master ");

            var curServerInfo = null;
            if (app.serverType === "rpc") {
                curServerInfo = {
                    "id": app.serverId,
                    "host": app.host,
                    "port": app.port
                }
            } else {
                var serverArr = app.getServersByType(app.serverType);
                for (var i = 0; i < serverArr.length; i++) {
                    if (serverArr[i].id === app.serverId) {
                        curServerInfo = serverArr[i];
                        break;
                    }
                }
            }

            var loginInfo = {
                T: 1,
                serverType: app.serverType,
                serverInfo: curServerInfo,
                serverToken: app.serverToken
            };
            loginInfo = msgCoder.encodeInnerData(loginInfo);
            client.send(loginInfo);
        };
        var client = new tcpClient(master.port, master.host, connectCb);
        client.on("data", function (data) {
            data = JSON.parse(data);
            if (data.T === 1) {
                addServer(data.serverInfo);
            } else if (data.T === 2) {
                removeServer(data);
            }
        });
        client.on("close", function () {
            app.logger(nowFileName, "error", "- " + app.serverId + " connect to master fail -- reconnect " + define.TIME.MONITOR_RECONNECT + "s later");
            connectToMaster(define.TIME.MONITOR_RECONNECT * 1000);
        });
    }, delay);
}


function addServer(servers) {
    var serversApp = app.servers;
    var server;
    for (var sid in servers) {
        server = servers[sid];
        if (server.serverType === "rpc") {
            app.rpcService.addRpcServer(server.serverInfo);
            continue;
        }
        if (!serversApp[server.serverType]) {
            serversApp[server.serverType] = [];
        }
        var has = false;
        for (var i = 0; i < serversApp[server.serverType].length; i++) {
            if (serversApp[server.serverType][i].id === server.serverInfo.id) {
                has = true;
                break;
            }
        }
        if (has) {
            continue;
        }
        serversApp[server.serverType].push(server.serverInfo);
        if (app.frontend && !app.noBack && !server.serverInfo.frontend) {
            app.remoteFrontend.addServer(server);
        }
    }
}

function removeServer(msg) {
    if (msg.serverType === "rpc") {
        app.rpcService.removeRpcServer(msg.id);
        return;
    }
    var serversApp = app.servers;
    if (serversApp[msg.serverType]) {
        for (var i = 0; i < serversApp[msg.serverType].length; i++) {
            if (serversApp[msg.serverType][i].id === msg.id) {
                serversApp[msg.serverType].splice(i, 1);
                if (app.frontend && !app.noBack && !msg.frontend) {
                    app.remoteFrontend.removeServer({
                        "serverType": msg.serverType,
                        "id": msg.id
                    });
                }
                break;
            }
        }
    }
}
