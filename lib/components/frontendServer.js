"use strict";
/**
 * 前端服务器启动监听端口，接受客户端的连接，并路由消息
 */
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var msgCoder_1 = require("./msgCoder");
var define = require("../util/define");
var path = __importStar(require("path"));
var fs = __importStar(require("fs"));
var wsServer_1 = __importDefault(require("./wsServer"));
var tcpServer_1 = __importDefault(require("./tcpServer"));
var interfaceDefine_1 = require("../util/interfaceDefine");
var session_1 = require("./session");
var remoteFrontend = __importStar(require("./remoteFrontend"));
var app;
var serverType;
var routeConfig;
var handshakeBuf;
var heartbeatBuf;
var msgHandler = {};
var decode = null;
var client_heartbeat_time = 0;
var maxConnectionNum = Number.POSITIVE_INFINITY;
function start(_app, cb) {
    app = _app;
    serverType = app.serverType;
    routeConfig = app.routeConfig;
    var connectorConfig = app.connectorConfig;
    if (connectorConfig) {
        if (connectorConfig.hasOwnProperty("heartbeat") && Number(connectorConfig.heartbeat) >= 5) {
            client_heartbeat_time = Number(connectorConfig.heartbeat) * 1000;
        }
        if (connectorConfig.hasOwnProperty("maxConnectionNum") && Number(connectorConfig.maxConnectionNum) > 0) {
            maxConnectionNum = Number(connectorConfig.maxConnectionNum);
        }
    }
    var encodeDecodeConfig = app.encodeDecodeConfig;
    if (encodeDecodeConfig) {
        decode = encodeDecodeConfig.decode || null;
        msgCoder_1.setEncode(encodeDecodeConfig.encode);
    }
    // 握手buffer
    var routeBuf = Buffer.from(JSON.stringify({ "route": routeConfig, "heartbeat": client_heartbeat_time / 1000 }));
    handshakeBuf = Buffer.alloc(routeBuf.length + 5);
    handshakeBuf.writeUInt32BE(routeBuf.length + 1, 0);
    handshakeBuf.writeUInt8(1 /* handshake */, 4);
    routeBuf.copy(handshakeBuf, 5);
    // 心跳buffer
    heartbeatBuf = Buffer.alloc(5);
    heartbeatBuf.writeUInt32BE(1, 0);
    heartbeatBuf.writeUInt8(3 /* heartbeatResponse */, 4);
    session_1.initSessionApp(app);
    loadHandler();
    startServer(cb);
}
exports.start = start;
/**
 * 前端服务器加载路由处理
 */
function loadHandler() {
    var dirName = path.join(app.base, define.some_config.File_Dir.Servers, app.serverType, "handler");
    var exists = fs.existsSync(dirName);
    if (exists) {
        fs.readdirSync(dirName).forEach(function (filename) {
            if (!/\.js$/.test(filename)) {
                return;
            }
            var name = path.basename(filename, '.js');
            var handler = require(path.join(dirName, filename));
            if (handler.default && typeof handler.default === "function") {
                msgHandler[name] = new handler.default(app);
            }
            else if (typeof handler === "function") {
                msgHandler[name] = new handler(app);
            }
        });
    }
}
/**
 * 启动服务器，监听端口
 */
function startServer(cb) {
    var startCb = function () {
        var str = "server start: " + app.host + ":" + app.port + " / " + app.serverId;
        console.log(str);
        app.logger(interfaceDefine_1.loggerType.info, interfaceDefine_1.componentName.frontendServer, str);
        cb && cb();
    };
    var newClientCb = function (socket) {
        if (app.clientNum >= maxConnectionNum) {
            app.logger(interfaceDefine_1.loggerType.warn, interfaceDefine_1.componentName.frontendServer, "socket num has reached the Max  " + app.clientNum + " , close it");
            socket.close();
            return;
        }
        var session = new session_1.Session();
        session.sid = app.serverId;
        session.socket = socket;
        app.clientNum++;
        heartbeat_handle(session);
        socket.on('data', data_Switch.bind(null, session));
        socket.on('close', socketClose.bind(null, session));
    };
    var configType = "";
    if (app.connectorConfig) {
        configType = app.connectorConfig.connector;
    }
    configType = configType === define.some_config.Connector.Ws ? define.some_config.Connector.Ws : define.some_config.Connector.Net;
    if (configType === define.some_config.Connector.Ws) {
        wsServer_1.default(app.port, startCb, newClientCb);
    }
    else {
        tcpServer_1.default(app.port, startCb, newClientCb);
    }
}
/**
 * 客户端断开连接
 * @param session
 */
function socketClose(session) {
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
function data_Switch(session, data) {
    var type = data.readUInt8(0);
    try {
        if (type === 3 /* msg */) { // 普通的自定义消息
            msg_handle(session, data);
        }
        else if (type === 2 /* heartbeat */) { // 心跳
            heartbeat_handle(session);
            heartbeatResponse(session);
        }
        else if (type === 1 /* handshake */) { // 握手
            handshake_handle(session);
        }
        else {
            session.socket.close();
        }
    }
    catch (e) {
        app.logger(interfaceDefine_1.loggerType.error, interfaceDefine_1.componentName.frontendServer, e);
    }
}
/**
 * 握手
 * @param session
 */
function handshake_handle(session) {
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
function heartbeat_handle(session) {
    if (client_heartbeat_time === 0) {
        return;
    }
    clearTimeout(session.heartbeat_timer);
    session.heartbeat_timer = setTimeout(function () {
        session.socket.close();
    }, client_heartbeat_time * 2);
}
/**
 * 心跳回应
 * @param session
 */
function heartbeatResponse(session) {
    session.socket.send(heartbeatBuf);
}
/**
 * 自定义消息
 * @param session
 * @param msgBuf
 */
function msg_handle(session, msgBuf) {
    if (!session.registered) {
        session.socket.close();
        return;
    }
    var cmdId = msgBuf.readUInt8(1);
    var cmd = routeConfig[cmdId];
    if (!cmd) {
        app.logger(interfaceDefine_1.loggerType.warn, interfaceDefine_1.componentName.frontendServer, "route index out of range: " + cmdId);
        return;
    }
    var cmdArr = cmd.split('.');
    if (serverType === cmdArr[0]) {
        var msg = void 0;
        if (decode) {
            msg = decode(cmdId, msgBuf.slice(2), session);
        }
        else {
            msg = JSON.parse(msgBuf.slice(2).toString());
        }
        msgHandler[cmdArr[1]][cmdArr[2]](msg, session, callBack(session.socket, cmdId));
    }
    else {
        remoteFrontend.doRemote(msgBuf.slice(1), session, cmdArr[0]);
    }
}
/**
 * 回调
 * @param socket
 * @param cmdId
 * @returns {Function}
 */
function callBack(socket, cmdId) {
    return function (msg) {
        if (msg === undefined) {
            msg = null;
        }
        var buf = msgCoder_1.encodeClientData(cmdId, msg);
        socket.send(buf);
    };
}
