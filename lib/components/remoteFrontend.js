"use strict";
/**
 * 前端服务器，对后端服务器连接的管理
 */
Object.defineProperty(exports, "__esModule", { value: true });
var interfaceDefine_1 = require("../util/interfaceDefine");
var tcpClient_1 = require("./tcpClient");
var define = require("../util/define");
var app;
var appClients;
var clients = {};
var router;
/**
 * 初始化
 */
function init(_app) {
    app = _app;
    router = app.router;
    appClients = app.clients;
}
exports.init = init;
/**
 * 新增后端服务器
 * @param server 后端服务器信息
 */
function addServer(server) {
    if (clients[server.serverType] && clients[server.serverType][server.serverInfo.id]) {
        clients[server.serverType][server.serverInfo.id].close();
    }
    if (!clients[server.serverType]) {
        clients[server.serverType] = {};
    }
    clients[server.serverType][server.serverInfo.id] = new remote_frontend_client(server);
}
exports.addServer = addServer;
/**
 * 移除后端服务器
 * @param serverInfo 后端服务器信息
 */
function removeServer(serverInfo) {
    if (clients[serverInfo.serverType] && clients[serverInfo.serverType][serverInfo.id]) {
        clients[serverInfo.serverType][serverInfo.id].close();
    }
}
exports.removeServer = removeServer;
/**
 * 转发客户端的消息至后端服务器
 * @param msgBuf 消息
 * @param session session信息
 * @param serverType 服务器类型
 */
function doRemote(msgBuf, session, serverType) {
    if (!clients[serverType]) {
        app.logger(interfaceDefine_1.loggerType.warn, interfaceDefine_1.componentName.remoteFrontend, app.serverId + " has no backend serverType: " + serverType);
        return;
    }
    var tmpRouter = router[serverType];
    if (!tmpRouter) {
        tmpRouter = defaultRoute;
    }
    tmpRouter(app, session, serverType, function (sid) {
        var client = clients[serverType][sid];
        if (!client || !client.isLive) {
            app.logger(interfaceDefine_1.loggerType.debug, interfaceDefine_1.componentName.remoteFrontend, app.serverId + " has no backend server " + sid);
            return;
        }
        var sessionBuf = Buffer.from(JSON.stringify(session.getAll()));
        var buf = Buffer.allocUnsafe(7 + sessionBuf.length + msgBuf.length);
        buf.writeUInt32BE(3 + sessionBuf.length + msgBuf.length, 0);
        buf.writeUInt8(3 /* msg */, 4);
        buf.writeUInt16BE(sessionBuf.length, 5);
        sessionBuf.copy(buf, 7);
        msgBuf.copy(buf, 7 + sessionBuf.length);
        client.send(buf);
    });
}
exports.doRemote = doRemote;
;
function defaultRoute(app, session, serverType, cb) {
    var list = app.getServersByType(serverType);
    if (!list || !list.length) {
        cb("");
        return;
    }
    var index = Math.floor(Math.random() * list.length);
    cb(list[index].id);
}
;
/**
 * 前端连接到后端的socket
 */
var remote_frontend_client = /** @class */ (function () {
    function remote_frontend_client(server) {
        this.connect_timer = null;
        this.heartbeat_timer = null;
        this.socket = null;
        this.isLive = false;
        this.id = server.serverInfo.id;
        this.host = server.serverInfo.host;
        this.port = server.serverInfo.port;
        this.serverType = server.serverType;
        this.doConnect(0);
    }
    /**
     * 开始连接
     * @param delay 延时
     */
    remote_frontend_client.prototype.doConnect = function (delay) {
        this.isLive = false;
        var self = this;
        this.connect_timer = setTimeout(function () {
            self.socket = new tcpClient_1.TcpClient(self.port, self.host, function () {
                app.logger(interfaceDefine_1.loggerType.info, interfaceDefine_1.componentName.remoteFrontend, app.serverId + " remote connect " + self.id + " success");
                // 注册
                var loginBuf = Buffer.from(JSON.stringify({
                    sid: app.serverId,
                    serverToken: app.serverToken
                }));
                var buf = Buffer.allocUnsafe(loginBuf.length + 5);
                buf.writeUInt32BE(loginBuf.length + 1, 0);
                buf.writeUInt8(1 /* register */, 4);
                loginBuf.copy(buf, 5);
                self.socket.send(buf);
                self.isLive = true;
                //心跳包
                self.heartbeat();
            });
            self.socket.on("data", self.data_switch.bind(self));
            self.socket.on("close", function () {
                clearTimeout(self.heartbeat_timer);
                app.logger(interfaceDefine_1.loggerType.warn, interfaceDefine_1.componentName.remoteFrontend, app.serverId + " remote connect " + self.id + " closed, reconnect later");
                self.doConnect(define.some_config.Time.Remote_Reconnect_Time * 1000);
            });
        }, delay);
    };
    /**
     * 心跳
     */
    remote_frontend_client.prototype.heartbeat = function () {
        var self = this;
        this.heartbeat_timer = setTimeout(function () {
            var buf = Buffer.allocUnsafe(5);
            buf.writeUInt32BE(1, 0);
            buf.writeUInt8(2 /* heartbeat */, 4);
            self.socket.send(buf);
            self.heartbeat();
        }, define.some_config.Time.Remote_Heart_Beat_Time * 1000);
    };
    /**
     * 消息分类
     */
    remote_frontend_client.prototype.data_switch = function (msg) {
        var type = msg.readUInt8(0);
        if (type === 1 /* msg */) {
            this.msg_handle(msg);
        }
        else if (type === 2 /* applySession */) {
            this.applySession_handle(msg);
        }
    };
    /**
     * 发送给客户端的消息
     */
    remote_frontend_client.prototype.msg_handle = function (data) {
        var uidsBufLen = data.readUInt16BE(1);
        var uids = JSON.parse(data.slice(3, 3 + uidsBufLen).toString());
        var msgBuf = data.slice(3 + uidsBufLen);
        var client;
        for (var i = 0; i < uids.length; i++) {
            client = appClients[uids[i]];
            if (client) {
                client.socket.send(msgBuf);
            }
        }
    };
    /**
     * 同步session的消息
     */
    remote_frontend_client.prototype.applySession_handle = function (data) {
        var session = JSON.parse(data.slice(1).toString());
        var client = appClients[session.uid];
        if (client) {
            client.setAll(session);
        }
    };
    /**
     * 发送数据
     * @param buf
     */
    remote_frontend_client.prototype.send = function (buf) {
        this.socket.send(buf);
    };
    /**
     * 关闭连接
     */
    remote_frontend_client.prototype.close = function () {
        delete clients[this.serverType][this.id];
        if (this.socket) {
            this.socket.close();
        }
        clearTimeout(this.connect_timer);
    };
    return remote_frontend_client;
}());
