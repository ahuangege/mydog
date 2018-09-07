var nowFileName = __filename;
var tcpClient = require("./tcpClient.js");
var msgCoder = require("./msgCoder.js");
var define = require("../util/define.js");
var cliUtil = require("./cliUtil.js");

var app = null;
var monitorCli = null;

module.exports.start = function (_app) {
    app = _app;
    monitorCli = cliUtil.newMonitorCli(app);
    connectToMaster(0);
};

function connectToMaster(delay) {
    setTimeout(function () {
        var master = app.master;
        var connectCb = function () {
            app.logger(nowFileName, "debug", "connected to master success: " + app.serverId);

            // 向master注册
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
                T: define.Monitor_To_Master.register,
                serverType: app.serverType,
                serverInfo: curServerInfo,
                serverToken: app.serverToken
            };
            loginInfo = msgCoder.encodeInnerData(loginInfo);
            client.send(loginInfo);

            // 心跳包
            heartBeat(client);
        };


        var client = new tcpClient(master.port, master.host, connectCb);
        client.on("data", function (data) {
            data = JSON.parse(data);

            if (data.T === define.Master_To_Monitor.addServer) {
                addServer(data.serverInfo);
            } else if (data.T === define.Master_To_Monitor.removeServer) {
                removeServer(data);
            } else if (data.T === define.Master_To_Monitor.cliMsg) {
                monitorCli.deal_master_msg(client, data);
            }
        });
        client.on("close", function () {
            clearTimeout(client.heartBeatTimer);
            app.logger(nowFileName, "error", "connect to master fail: " + app.serverId);
            connectToMaster(define.Time.Monitor_Reconnect_Time * 1000);
        });
    }, delay);
}


function heartBeat(socket) {
    socket.heartBeatTimer = setTimeout(function () {
        var heartBeatMsg = {T: define.Monitor_To_Master.heartbeat};
        heartBeatMsg = msgCoder.encodeInnerData(heartBeatMsg);
        socket.send(heartBeatMsg);
        heartBeat(socket);
    }, define.Time.Monitor_Heart_Beat_Time * 1000)
}

function addServer(servers) {
    var serversApp = app.servers;
    var serversIdMap = app.serversIdMap;
    var server;
    var serverInfo;
    for (var sid in servers) {
        server = servers[sid];
        serverInfo = server.serverInfo;
        if (server.serverType === "rpc") {
            app.rpcServersIdMap[serverInfo.id] = serverInfo;
            app.rpcService.addRpcServer(serverInfo);
            continue;
        }
        if (serversIdMap[serverInfo.id]) {
            continue;
        }
        serversIdMap[serverInfo.id] = serverInfo;
        if (!serversApp[server.serverType]) {
            serversApp[server.serverType] = [];
        }
        serversApp[server.serverType].push(serverInfo);

        if (app.frontend && !app.alone && !serverInfo.frontend && !serverInfo.alone) {
            app.remoteFrontend.addServer(server);
        }
    }
}

function removeServer(msg) {
    if (msg.serverType === "rpc") {
        delete  app.rpcServersIdMap[msg.id];
        app.rpcService.removeRpcServer(msg.id);
        return;
    }
    delete app.serversIdMap[msg.id];
    var serversApp = app.servers;
    if (serversApp[msg.serverType]) {
        for (var i = 0; i < serversApp[msg.serverType].length; i++) {
            if (serversApp[msg.serverType][i].id === msg.id) {
                serversApp[msg.serverType].splice(i, 1);
                if (app.frontend && !app.alone) {
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
