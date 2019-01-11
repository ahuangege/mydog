/**
 * 前端服务器启动监听端口，接受客户端的连接，并路由消息
 */


import Application from "../application";
import { setEncode, encodeClientData } from "./msgCoder";
import define = require("../util/define");
import * as path from "path";
import * as fs from "fs";
import wsServer from "./wsServer";
import tcpServer from "./tcpServer";
import { SocketProxy, loggerType, componentName } from "../util/interfaceDefine";
import { Session, initSessionApp } from "./session";

let app: Application;
let serverType: string;
let routeConfig: string[];
let handshakeBuf: Buffer;
let msgHandler: { [filename: string]: any } = {};
let decode: Function = null as any;
let client_heartbeat_time: number = 0;
let maxConnectionNum = Number.POSITIVE_INFINITY;


export function start(_app: Application, cb: Function) {
    app = _app;
    serverType = app.serverType;
    routeConfig = app.routeConfig;
    let connectorConfig = app.get("connectorConfig");
    if (connectorConfig) {
        if (connectorConfig.hasOwnProperty("heartbeat") && Number(connectorConfig.heartbeat) >= 5) {
            client_heartbeat_time = Number(connectorConfig.heartbeat) * 1000;
        }
        if (connectorConfig.hasOwnProperty("maxConnectionNum") && Number(connectorConfig.maxConnectionNum) > 0) {
            maxConnectionNum = Number(connectorConfig.maxConnectionNum);
        }
    }
    let encodeDecodeConfig = app.get("encodeDecodeConfig");
    if (encodeDecodeConfig) {
        decode = encodeDecodeConfig["decode"] || null;
        setEncode(encodeDecodeConfig.encode);
    }

    // 握手buffer
    let routeBuf = Buffer.from(JSON.stringify({ "route": routeConfig, "heartbeat": client_heartbeat_time / 1000 }));
    handshakeBuf = Buffer.alloc(routeBuf.length + 5);
    handshakeBuf.writeUInt32BE(routeBuf.length + 1, 0);
    handshakeBuf.writeUInt8(define.Server_To_Client.handshake, 4);
    routeBuf.copy(handshakeBuf, 5);

    initSessionApp(app);
    loadHandler();
    startServer(cb);
}

/**
 * 前端服务器加载路由处理
 */
function loadHandler() {
    let dirName = path.join(app.base, define.some_config.File_Dir.Servers, app.serverType, "handler");
    let exists = fs.existsSync(dirName);
    if (exists) {
        fs.readdirSync(dirName).forEach(function (filename) {
            if (!/\.js$/.test(filename)) {
                return;
            }
            let name = path.basename(filename, '.js');
            let handler = require(path.join(dirName, filename));
            if (handler.default && typeof handler.default === "function") {
                msgHandler[name] = new handler.default(app);
            } else if (typeof handler === "function") {
                msgHandler[name] = new handler(app);
            }
        });
    }
}

/**
 * 启动服务器，监听端口
 */
function startServer(cb: Function) {
    let startCb = function () {
        console.log("server start: " + app.host + ":" + app.port + " / " + app.serverId);
        cb && cb();
    };
    let newClientCb = function (socket: SocketProxy) {
        if (app.clientNum >= maxConnectionNum) {
            app.logger(loggerType.warn, componentName.frontendServer, "socket num has reached the Max  " + app.clientNum);
            socket.close();
            return;
        }
        let session = new Session();
        session.sid = app.serverId;
        session.socket = socket;
        app.clientNum++;
        heartbeat_handle(session);
        socket.on('data', data_Switch.bind(null, session));
        socket.on('close', socketClose.bind(null, session));
    };

    let configType = "";
    if (app.get("connectorConfig")) {
        configType = app.get("connectorConfig").connector;
    }
    configType = configType === define.some_config.Connector.Ws ? define.some_config.Connector.Ws : define.some_config.Connector.Net;

    if (configType === define.some_config.Connector.Ws) {
        wsServer(app.port, startCb, newClientCb);
    } else {
        tcpServer(app.port, startCb, newClientCb);
    }
}


/**
 * 客户端断开连接
 * @param session
 */
function socketClose(session: Session) {
    delete app.clients[session.uid];
    app.clientNum--;
    clearTimeout(session.heartbeat_timer);
    if (session._onclosed) {
        session._onclosed(app, session);
    }
}

/**
 * 收到客户端消息
 */
function data_Switch(session: Session, data: Buffer) {
    let type = data.readUInt8(0);
    if (type === define.Client_To_Server.msg) {               // 普通的自定义消息
        msg_handle(session, data);
    } else if (type === define.Client_To_Server.heartbeat) {        // 心跳
        heartbeat_handle(session);
    } else if (type === define.Client_To_Server.handshake) {        // 握手
        handshake_handle(session);
    } else {
        session.socket.close();
    }
}


/**
 * 握手
 * @param session
 */
function handshake_handle(session: Session) {
    if (session.registered) {
        session.socket.close();
        return;
    }
    session.registered = true;
    session.socket.send(handshakeBuf);
}

/**
 * 心跳
 * @param session
 */
function heartbeat_handle(session: Session) {
    if (client_heartbeat_time === 0) {
        return;
    }
    clearTimeout(session.heartbeat_timer);
    session.heartbeat_timer = setTimeout(function () {
        session.socket.close();
    }, client_heartbeat_time * 2);
}

/**
 * 自定义消息
 * @param session
 * @param msgBuf
 */
function msg_handle(session: Session, msgBuf: Buffer) {
    if (!session.registered) {
        session.socket.close();
        return;
    }
    let cmdId = msgBuf.readUInt8(1);
    let cmd = routeConfig[cmdId];
    if (!cmd) {
        app.logger(loggerType.warn, componentName.frontendServer, "route index out of range: " + cmdId);
        return;
    }

    let cmdArr = cmd.split('.');
    if (serverType === cmdArr[0]) {
        let msg: any;
        if (decode) {
            msg = decode(cmdId, msgBuf.slice(2), session);
        } else {
            msg = JSON.parse(msgBuf.slice(2).toString());
        }
        msgHandler[cmdArr[1]][cmdArr[2]](msg, session, callBack(session.socket, cmdId));
    } else {
        app.remoteFrontend.doRemote(msgBuf.slice(1), session, cmdArr[0]);
    }
}

/**
 * 回调
 * @param socket
 * @param cmdId
 * @returns {Function}
 */
function callBack(socket: SocketProxy, cmdId: number) {
    return function (msg: any) {
        if (msg === undefined) {
            msg = null;
        }
        let buf = encodeClientData(cmdId, msg);
        socket.send(buf);
    }
}
