/**
 * 非master服务器启动后，由此连接master服，互相认识，并处理相关逻辑
 */


import Application from "../application";
import { MonitorCli } from "./cliUtil";
import { TcpClient } from "./tcpClient";
import define = require("../util/define");
import { SocketProxy, ServerInfo, monitor_get_new_server, monitor_remove_server, loggerType, componentName, monitor_reg_master } from "../util/interfaceDefine";
import { encodeInnerData } from "./msgCoder";
import * as remoteFrontend from "./remoteFrontend";
import * as rpcService from "./rpcService";

let app: Application;
let monitorCli: MonitorCli;
let removeDiffServers: { [id: string]: string } = {}; // monitor重连后，待对比移除的server集合
let needDiff: boolean = false; // 是否需要对比
let diffTimer: NodeJS.Timer = null as any;

export function start(_app: Application) {
    app = _app;
    monitorCli = new MonitorCli(app);
    needDiff = false;
    connectToMaster(0);
}


function connectToMaster(delay: number) {
    setTimeout(function () {
        let connectCb = function () {
            app.logger(loggerType.info, componentName.monitor, app.serverId + " monitor connected to master success ");

            // 向master注册
            let curServerInfo: ServerInfo = null as any;
            if (app.serverType === "rpc") {
                curServerInfo = {
                    "id": app.serverId,
                    "host": app.host,
                    "port": app.port
                }
            } else {
                curServerInfo = app.serverInfo;
            }
            let loginInfo: monitor_reg_master = {
                T: define.Monitor_To_Master.register,
                serverType: app.serverType,
                serverInfo: curServerInfo,
                serverToken: app.serverToken
            };
            let loginInfoBuf = encodeInnerData(loginInfo);
            client.send(loginInfoBuf);

            // 心跳包
            heartBeat(client);
        };

        let client: SocketProxy = new TcpClient(app.masterConfig.port, app.masterConfig.host, connectCb);
        client.on("data", function (_data: Buffer) {

            let data: any = JSON.parse(_data.toString());

            if (data.T === define.Master_To_Monitor.addServer) {
                addServer((data as monitor_get_new_server).serverInfoIdMap);
            } else if (data.T === define.Master_To_Monitor.removeServer) {
                removeServer(data as monitor_remove_server);
            } else if (data.T === define.Master_To_Monitor.cliMsg) {
                monitorCli.deal_master_msg(client, data);
            }
        });
        client.on("close", function () {
            app.logger(loggerType.error, componentName.master, app.serverId + " monitor closed, reconnect later");
            needDiff = true;
            removeDiffServers = {};
            clearTimeout(diffTimer);
            clearTimeout(client.heartBeatTimer);
            connectToMaster(define.some_config.Time.Monitor_Reconnect_Time * 1000);
        });
    }, delay);
}


function heartBeat(socket: SocketProxy) {
    socket.heartBeatTimer = setTimeout(function () {
        let heartBeatMsg = { T: define.Monitor_To_Master.heartbeat };
        let heartBeatMsgBuf = encodeInnerData(heartBeatMsg);
        socket.send(heartBeatMsgBuf);
        heartBeat(socket);
    }, define.some_config.Time.Monitor_Heart_Beat_Time * 1000)
}

function addServer(servers: { [id: string]: { "serverType": string, "serverInfo": ServerInfo } }) {
    if (needDiff) {
        diffTimerStart();
    }
    let serversApp = app.servers;
    let serversIdMap = app.serversIdMap;
    let server: { "serverType": string, "serverInfo": ServerInfo };
    let serverInfo: ServerInfo;
    for (let sid in servers) {
        server = servers[sid];
        serverInfo = server.serverInfo;
        if (needDiff) {
            addOrRemoveDiffServer(serverInfo.id, true, server.serverType);
        }
        let tmpServer: ServerInfo;
        if (server.serverType === "rpc") {
            tmpServer = app.rpcServersIdMap[serverInfo.id]
            if (tmpServer && tmpServer.host === serverInfo.host && tmpServer.port === serverInfo.port) {    // 如果已经存在且ip配置相同，则忽略
                continue;
            }
            app.rpcServersIdMap[serverInfo.id] = serverInfo;
            rpcService.addRpcServer(serverInfo);
            continue;
        }
        tmpServer = serversIdMap[serverInfo.id]
        if (tmpServer && tmpServer.host === serverInfo.host && tmpServer.port === serverInfo.port) {    // 如果已经存在且ip配置相同，则忽略（不考虑其他配置，请开发者自己保证）
            continue;
        }
        if (!serversApp[server.serverType]) {
            serversApp[server.serverType] = [];
        }
        if (!!tmpServer) {
            for (let i = 0, len = serversApp[server.serverType].length; i < len; i++) {
                if (serversApp[server.serverType][i].id === tmpServer.id) {
                    serversApp[server.serverType].splice(i, 1);
                    if (app.frontend && !app.alone) {
                        remoteFrontend.removeServer({
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
            remoteFrontend.addServer(server);
        }
    }
}

function removeServer(msg: monitor_remove_server) {
    if (needDiff) {
        diffTimerStart();
        addOrRemoveDiffServer(msg.id, false);
    }
    if (msg.serverType === "rpc") {
        delete app.rpcServersIdMap[msg.id];
        rpcService.removeRpcServer(msg.id);
        return;
    }
    delete app.serversIdMap[msg.id];
    let serversApp = app.servers;
    if (serversApp[msg.serverType]) {
        for (let i = 0; i < serversApp[msg.serverType].length; i++) {
            if (serversApp[msg.serverType][i].id === msg.id) {
                serversApp[msg.serverType].splice(i, 1);
                if (app.frontend && !app.alone) {
                    remoteFrontend.removeServer({
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


function addOrRemoveDiffServer(sid: string, add: boolean, serverType?: string) {
    if (add) {
        removeDiffServers[sid] = serverType as string;
    } else {
        delete removeDiffServers[sid];
    }
}

function diffTimerStart() {
    clearTimeout(diffTimer);
    diffTimer = setTimeout(diffFunc, 3000);     // 3秒后对比
}


function diffFunc() {
    needDiff = false;
    let servers = app.servers;

    for (let serverType in servers) {
        for (let i = 0, len = servers[serverType].length; i < len; i++) {
            let id = servers[serverType][i].id;
            if (id === app.serverId) {
                continue;
            }
            if (!removeDiffServers[id]) {
                delete app.serversIdMap[id];
                servers[serverType].splice(i, 1);
                remoteFrontend.removeServer({ "serverType": serverType, "id": id });
                app.emit("onRemoveServer", serverType, id);
            }
        }
    }

    for (let id in app.rpcServersIdMap) {
        if (id === app.serverId) {
            continue;
        }
        if (!removeDiffServers[id]) {
            delete app.rpcServersIdMap[id];
            rpcService.removeRpcServer(id);
        }
    }
    removeDiffServers = {};
}