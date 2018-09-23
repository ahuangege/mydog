/**
 * 非master服务器启动后，由此连接master服，互相认识，并处理相关逻辑
 */


import Application from "../application";
import { MonitorCli } from "./cliUtil";
import { TcpClient } from "./tcpClient";
import define from "../util/define";
import { SocketProxy, ServerInfo, monitor_get_new_server, monitor_remove_server, loggerType, componentName, monitor_reg_master } from "../util/interfaceDefine";
import { encodeInnerData } from "./msgCoder";

let app: Application;
let monitorCli: MonitorCli;
export function start(_app: Application) {
    app = _app;
    monitorCli = new MonitorCli(app);
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
            clearTimeout(client.heartBeatTimer);
            app.logger(loggerType.error, componentName.master, app.serverId + " monitor closed, reconnect later");
            connectToMaster(define.Time.Monitor_Reconnect_Time * 1000);
        });
    }, delay);
}


function heartBeat(socket: SocketProxy) {
    socket.heartBeatTimer = setTimeout(function () {
        let heartBeatMsg = { T: define.Monitor_To_Master.heartbeat };
        let heartBeatMsgBuf = encodeInnerData(heartBeatMsg);
        socket.send(heartBeatMsgBuf);
        heartBeat(socket);
    }, define.Time.Monitor_Heart_Beat_Time * 1000)
}

function addServer(servers: { [id: string]: { "serverType": string, "serverInfo": ServerInfo } }) {
    let serversApp = app.servers;
    let serversIdMap = app.serversIdMap;
    let server: { "serverType": string, "serverInfo": ServerInfo };
    let serverInfo: ServerInfo;
    for (let sid in servers) {
        server = servers[sid];
        serverInfo = server.serverInfo;
        if (server.serverType === "rpc") {
            if (app.rpcServersIdMap[serverInfo.id]) {
                continue;
            }
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

function removeServer(msg: monitor_remove_server) {
    if (msg.serverType === "rpc") {
        delete app.rpcServersIdMap[msg.id];
        app.rpcService.removeRpcServer(msg.id);
        return;
    }
    delete app.serversIdMap[msg.id];
    let serversApp = app.servers;
    if (serversApp[msg.serverType]) {
        for (let i = 0; i < serversApp[msg.serverType].length; i++) {
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
