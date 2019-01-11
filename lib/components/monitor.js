"use strict";
/**
 * 非master服务器启动后，由此连接master服，互相认识，并处理相关逻辑
 */
Object.defineProperty(exports, "__esModule", { value: true });
var cliUtil_1 = require("./cliUtil");
var tcpClient_1 = require("./tcpClient");
var define = require("../util/define");
var interfaceDefine_1 = require("../util/interfaceDefine");
var msgCoder_1 = require("./msgCoder");
var app;
var monitorCli;
var removeDiffServers = {}; // monitor重连后，待对比移除的server集合
var needDiff = false; // 是否需要对比
var diffTimer = null;
function start(_app) {
    app = _app;
    monitorCli = new cliUtil_1.MonitorCli(app);
    needDiff = false;
    connectToMaster(0);
}
exports.start = start;
function connectToMaster(delay) {
    setTimeout(function () {
        var connectCb = function () {
            app.logger(interfaceDefine_1.loggerType.info, interfaceDefine_1.componentName.monitor, app.serverId + " monitor connected to master success ");
            // 向master注册
            var curServerInfo = null;
            if (app.serverType === "rpc") {
                curServerInfo = {
                    "id": app.serverId,
                    "host": app.host,
                    "port": app.port
                };
            }
            else {
                curServerInfo = app.serverInfo;
            }
            var loginInfo = {
                T: 1 /* register */,
                serverType: app.serverType,
                serverInfo: curServerInfo,
                serverToken: app.serverToken
            };
            var loginInfoBuf = msgCoder_1.encodeInnerData(loginInfo);
            client.send(loginInfoBuf);
            // 心跳包
            heartBeat(client);
        };
        var client = new tcpClient_1.TcpClient(app.masterConfig.port, app.masterConfig.host, connectCb);
        client.on("data", function (_data) {
            var data = JSON.parse(_data.toString());
            if (data.T === 1 /* addServer */) {
                addServer(data.serverInfoIdMap);
            }
            else if (data.T === 2 /* removeServer */) {
                removeServer(data);
            }
            else if (data.T === 3 /* cliMsg */) {
                monitorCli.deal_master_msg(client, data);
            }
        });
        client.on("close", function () {
            app.logger(interfaceDefine_1.loggerType.error, interfaceDefine_1.componentName.master, app.serverId + " monitor closed, reconnect later");
            needDiff = true;
            removeDiffServers = {};
            clearTimeout(diffTimer);
            clearTimeout(client.heartBeatTimer);
            connectToMaster(define.some_config.Time.Monitor_Reconnect_Time * 1000);
        });
    }, delay);
}
function heartBeat(socket) {
    socket.heartBeatTimer = setTimeout(function () {
        var heartBeatMsg = { T: 2 /* heartbeat */ };
        var heartBeatMsgBuf = msgCoder_1.encodeInnerData(heartBeatMsg);
        socket.send(heartBeatMsgBuf);
        heartBeat(socket);
    }, define.some_config.Time.Monitor_Heart_Beat_Time * 1000);
}
function addServer(servers) {
    if (needDiff) {
        diffTimerStart();
    }
    var serversApp = app.servers;
    var serversIdMap = app.serversIdMap;
    var server;
    var serverInfo;
    for (var sid in servers) {
        server = servers[sid];
        serverInfo = server.serverInfo;
        if (needDiff) {
            addOrRemoveDiffServer(serverInfo.id, true, server.serverType);
        }
        var tmpServer = void 0;
        if (server.serverType === "rpc") {
            tmpServer = app.rpcServersIdMap[serverInfo.id];
            if (tmpServer && tmpServer.host === serverInfo.host && tmpServer.port === serverInfo.port) { // 如果已经存在且ip配置相同，则忽略
                continue;
            }
            app.rpcServersIdMap[serverInfo.id] = serverInfo;
            app.rpcService.addRpcServer(serverInfo);
            continue;
        }
        tmpServer = serversIdMap[serverInfo.id];
        if (tmpServer && tmpServer.host === serverInfo.host && tmpServer.port === serverInfo.port) { // 如果已经存在且ip配置相同，则忽略（不考虑其他配置，请开发者自己保证）
            continue;
        }
        if (!serversApp[server.serverType]) {
            serversApp[server.serverType] = [];
        }
        if (!!tmpServer) {
            for (var i = 0, len = serversApp[server.serverType].length; i < len; i++) {
                if (serversApp[server.serverType][i].id === tmpServer.id) {
                    serversApp[server.serverType].splice(i, 1);
                    if (app.frontend && !app.alone) {
                        app.remoteFrontend.removeServer({
                            "serverType": server.serverType,
                            "id": tmpServer.id
                        });
                        app.emit("onRemoveServer", server.serverType, tmpServer.id);
                    }
                }
            }
        }
        serversApp[server.serverType].push(serverInfo);
        serversIdMap[serverInfo.id] = serverInfo;
        app.emit("onAddServer", server.serverType, serverInfo.id);
        if (app.frontend && !app.alone && !serverInfo.frontend && !serverInfo.alone) {
            app.remoteFrontend.addServer(server);
        }
    }
}
function removeServer(msg) {
    if (needDiff) {
        diffTimerStart();
        addOrRemoveDiffServer(msg.id, false);
    }
    if (msg.serverType === "rpc") {
        delete app.rpcServersIdMap[msg.id];
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
                    app.emit("onRemoveServer", msg.serverType, msg.id);
                }
                break;
            }
        }
    }
}
function addOrRemoveDiffServer(sid, add, serverType) {
    if (add) {
        removeDiffServers[sid] = serverType;
    }
    else {
        delete removeDiffServers[sid];
    }
}
function diffTimerStart() {
    clearTimeout(diffTimer);
    diffTimer = setTimeout(diffFunc, 3000); // 3秒后对比
}
function diffFunc() {
    needDiff = false;
    var servers = app.servers;
    for (var serverType in servers) {
        for (var i = 0, len = servers[serverType].length; i < len; i++) {
            var id = servers[serverType][i].id;
            if (id === app.serverId) {
                continue;
            }
            if (!removeDiffServers[id]) {
                delete app.serversIdMap[id];
                servers[serverType].splice(i, 1);
                app.remoteFrontend.removeServer({ "serverType": serverType, "id": id });
                app.emit("onRemoveServer", serverType, id);
            }
        }
    }
    for (var id in app.rpcServersIdMap) {
        if (id === app.serverId) {
            continue;
        }
        if (!removeDiffServers[id]) {
            delete app.rpcServersIdMap[id];
            app.rpcService.removeRpcServer(id);
        }
    }
    removeDiffServers = {};
}
