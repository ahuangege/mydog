"use strict";
/**
 * rpc连接的管理，发送rpc消息
 */
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
var interfaceDefine_1 = require("../util/interfaceDefine");
var path = __importStar(require("path"));
var fs = __importStar(require("fs"));
var define = require("../util/define");
var tcpClient_1 = require("./tcpClient");
var app;
var rpcRouter;
var servers;
var serversIdMap;
var connectingClients = {};
var client_index = 1;
var clients = [];
var msgHandler = {};
var rpcId = 1; // 必须从1开始，不可为0
var rpcRequest = {};
var rpcTimeMax = 10 * 1000;
/**
 * 初始化
 * @param _app
 */
function init(_app) {
    app = _app;
    rpcRouter = app.rpcRouter;
    servers = app.servers;
    serversIdMap = app.serversIdMap;
    var rpcConfig = app.rpcConfig;
    if (rpcConfig) {
        if (rpcConfig.hasOwnProperty("timeOut") && Number(rpcConfig["timeOut"]) > 5) {
            rpcTimeMax = Number(rpcConfig["timeOut"]) * 1000;
        }
    }
    new rpc_create();
}
exports.init = init;
/**
 * 新增rpc server
 * @param server
 */
function addRpcServer(server) {
    if (connectingClients[server.id]) {
        connectingClients[server.id].close();
    }
    else {
        for (var i = 0; i < clients.length; i++) {
            if (clients[i].id === server.id) {
                clients[i].close();
                break;
            }
        }
    }
    new rpc_client_proxy(server);
}
exports.addRpcServer = addRpcServer;
/**
 * 移除rpc server
 * @param id
 */
function removeRpcServer(id) {
    for (var i = 0; i < clients.length; i++) {
        if (clients[i].id === id) {
            clients[i].close();
            return;
        }
    }
    if (connectingClients[id]) {
        connectingClients[id].close();
    }
}
exports.removeRpcServer = removeRpcServer;
;
/**
 * rpc构造
 */
var rpc_create = /** @class */ (function () {
    function rpc_create() {
        this.rpcType = 0 /* route */;
        this.rpcParam = null;
        this.rpcObj = {};
        this.loadRemoteMethod();
    }
    rpc_create.prototype.loadRemoteMethod = function () {
        var self = this;
        app.rpc = { "route": this.route.bind(this), "toServer": this.toServer.bind(this) };
        var tmp_rpc_obj = this.rpcObj;
        var dirName = path.join(app.base, define.some_config.File_Dir.Servers);
        var exists = fs.existsSync(dirName);
        if (!exists) {
            return;
        }
        fs.readdirSync(dirName).forEach(function (serverName) {
            var server = {};
            var remoteDirName = path.join(dirName, serverName, '/remote');
            var exists = fs.existsSync(remoteDirName);
            if (exists) {
                fs.readdirSync(remoteDirName).forEach(function (fileName) {
                    if (!/\.js$/.test(fileName)) {
                        return;
                    }
                    var name = path.basename(fileName, '.js');
                    var remote = require(path.join(remoteDirName, fileName));
                    if (remote.default && typeof remote.default === "function") {
                        server[name] = new remote.default(app);
                    }
                    else if (typeof remote === "function") {
                        server[name] = new remote(app);
                    }
                });
            }
            tmp_rpc_obj[serverName] = {};
            for (var name_1 in server) {
                tmp_rpc_obj[serverName][name_1] = self.initFunc(serverName, name_1, server[name_1]);
            }
            if (serverName === app.serverType) {
                msgHandler = server;
            }
        });
    };
    rpc_create.prototype.route = function (routeParam) {
        this.rpcType = 0 /* route */;
        this.rpcParam = routeParam;
        return this.rpcObj;
    };
    rpc_create.prototype.toServer = function (serverId) {
        this.rpcType = 1 /* toServer */;
        this.rpcParam = serverId;
        return this.rpcObj;
    };
    rpc_create.prototype.initFunc = function (serverName, fileName, obj) {
        var res = {};
        for (var field in obj) {
            if (typeof obj[field] === "function") {
                res[field] = this.proxyCb(serverName, fileName + "." + field);
            }
        }
        return res;
    };
    rpc_create.prototype.proxyCb = function (serverName, file_method) {
        var self = this;
        var func = function () {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i] = arguments[_i];
            }
            if (self.rpcType === 0 /* route */) {
                self.proxyCbSendByRoute(self.rpcParam, serverName, file_method, args);
            }
            else {
                self.proxyCbSendToServer(self.rpcParam, serverName, file_method, args);
            }
            self.rpcParam = null;
        };
        return func;
    };
    rpc_create.prototype.proxyCbSendByRoute = function (routeParam, serverType, file_method, args) {
        var cb = null;
        if (typeof args[args.length - 1] === "function") {
            cb = args.pop();
        }
        var cbFunc = function (sid) {
            if (!serversIdMap[sid]) {
                cb && cb(1 /* src_has_no_end */);
                return;
            }
            if (sid === app.serverId) {
                if (cb) {
                    var timeout = {
                        "id": getRpcId(),
                        "cb": cb,
                        "timer": null
                    };
                    createRpcTimeout(timeout);
                    args.push(getCallBackFuncSelf(timeout.id));
                }
                sendRpcMsgToSelf(file_method, args);
                return;
            }
            var client = getRpcSocket();
            if (!client) {
                cb && cb(2 /* src_has_no_rpc */);
                return;
            }
            var rpcInvoke = {
                "from": app.serverId,
                "to": sid,
                "route": file_method
            };
            if (cb) {
                var timeout = {
                    "id": getRpcId(),
                    "cb": cb,
                    "timer": null
                };
                createRpcTimeout(timeout);
                rpcInvoke["id"] = timeout.id;
            }
            sendRpcMsg(client, rpcInvoke, args);
        };
        var tmpRouter = rpcRouter[serverType];
        if (tmpRouter) {
            tmpRouter(app, routeParam, cbFunc);
        }
        else {
            var list = servers[serverType];
            if (!list || !list.length) {
                cbFunc("");
            }
            else {
                var index = Math.floor(Math.random() * list.length);
                cbFunc(list[index].id);
            }
        }
    };
    rpc_create.prototype.proxyCbSendToServer = function (toServerId, serverType, file_method, args) {
        if (toServerId === "*") {
            this.proxyCbSendToServerType(serverType, file_method, args);
            return;
        }
        var cb = null;
        if (typeof args[args.length - 1] === "function") {
            cb = args.pop();
        }
        if (!serversIdMap[toServerId]) {
            cb && cb(1 /* src_has_no_end */);
            return;
        }
        if (toServerId === app.serverId) {
            if (cb) {
                var timeout = {
                    "id": getRpcId(),
                    "cb": cb,
                    "timer": null
                };
                createRpcTimeout(timeout);
                args.push(getCallBackFuncSelf(timeout.id));
            }
            sendRpcMsgToSelf(file_method, args);
            return;
        }
        var client = getRpcSocket();
        if (!client) {
            cb && cb(2 /* src_has_no_rpc */);
            return;
        }
        var rpcInvoke = {
            "from": app.serverId,
            "to": toServerId,
            "route": file_method
        };
        if (cb) {
            var timeout = {
                "id": getRpcId(),
                "cb": cb,
                "timer": null
            };
            createRpcTimeout(timeout);
            rpcInvoke.id = timeout.id;
        }
        sendRpcMsg(client, rpcInvoke, args);
    };
    rpc_create.prototype.proxyCbSendToServerType = function (serverType, file_method, args) {
        var cb = null;
        if (typeof args[args.length - 1] === "function") {
            cb = args.pop();
        }
        var endTo = [];
        if (servers[serverType]) {
            for (var i = 0; i < servers[serverType].length; i++) {
                endTo.push(servers[serverType][i].id);
            }
        }
        if (endTo.length === 0) {
            cb && cb({});
            return;
        }
        var nums = endTo.length;
        var bindCb = null;
        var msgObj = {};
        if (cb) {
            bindCb = function (id) {
                return function () {
                    var msg = [];
                    for (var _i = 0; _i < arguments.length; _i++) {
                        msg[_i] = arguments[_i];
                    }
                    nums--;
                    msgObj[id] = msg;
                    if (nums === 0) {
                        cb(msgObj);
                    }
                };
            };
        }
        var tmpCb = null;
        for (var i = 0; i < endTo.length; i++) {
            if (cb) {
                tmpCb = bindCb(endTo[i]);
            }
            send(endTo[i], tmpCb);
        }
        function send(toId, callback) {
            if (toId === app.serverId) {
                var tmp_args = args.slice();
                if (callback) {
                    var timeout = {
                        "id": getRpcId(),
                        "cb": callback,
                        "timer": null
                    };
                    createRpcTimeout(timeout);
                    tmp_args.push(getCallBackFuncSelf(timeout.id));
                }
                sendRpcMsgToSelf(file_method, tmp_args);
                return;
            }
            var client = getRpcSocket();
            if (!client) {
                callback && callback(2 /* src_has_no_rpc */);
                return;
            }
            var rpcInvoke = {
                "from": app.serverId,
                "to": toId,
                "route": file_method
            };
            if (callback) {
                var timeout = {
                    "id": getRpcId(),
                    "cb": callback,
                    "timer": null
                };
                createRpcTimeout(timeout);
                rpcInvoke["id"] = timeout.id;
            }
            sendRpcMsg(client, rpcInvoke, args);
        }
    };
    return rpc_create;
}());
/**
 * rpc超时计时器
 * @param timeout
 */
function createRpcTimeout(timeout) {
    rpcRequest[timeout.id] = timeout;
    timeout.timer = setTimeout(function () {
        delRequest(timeout.id);
        timeout.cb(4 /* rpc_time_out */);
    }, rpcTimeMax);
}
/**
 * 获取rpcId
 */
function getRpcId() {
    var id = rpcId++;
    if (rpcId > 999999) {
        rpcId = 1;
    }
    return id;
}
/**
 * 获取一个rpc socket
 */
function getRpcSocket() {
    var socket = null;
    if (clients.length) {
        socket = clients[client_index % clients.length];
        client_index = (client_index + 1) % clients.length;
    }
    return socket;
}
/**
 * 发送给rpc服务器，进行中转
 * @param client
 * @param iMsg 内部导向消息
 * @param msg 用户传输消息
 *
 *  消息格式如下:
 *
 *    [4]        [1]         [4]         [1]         [1]      [...]      [...]
 *  allMsgLen   msgType    rpcMsgLen  rpcMsgType   iMsgLen    iMsg        msg
 *
 */
function sendRpcMsg(client, iMsg, msg) {
    var iMsgBuf = Buffer.from(JSON.stringify(iMsg));
    var msgBuf = Buffer.from(JSON.stringify(msg));
    var buf = Buffer.allocUnsafe(11 + iMsgBuf.length + msgBuf.length);
    buf.writeUInt32BE(7 + iMsgBuf.length + msgBuf.length, 0);
    buf.writeUInt8(3 /* msg */, 4);
    buf.writeUInt32BE(2 + iMsgBuf.length + msgBuf.length, 5);
    buf.writeUInt8(1 /* msg */, 9);
    buf.writeUInt8(iMsgBuf.length, 10);
    iMsgBuf.copy(buf, 11);
    msgBuf.copy(buf, 11 + iMsgBuf.length);
    client.send(buf);
}
function sendRpcMsgToSelf(route, msg) {
    var cmd = route.split('.');
    var file = msgHandler[cmd[0]];
    file[cmd[1]].apply(file, msg);
}
/**
 * 删除rpc计时
 */
function delRequest(id) {
    delete rpcRequest[id];
}
/**
 * rpc回调
 */
function getCallBackFunc(to, id) {
    return function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        var rpcInvoke = {
            "to": to,
            "id": id
        };
        var client = getRpcSocket();
        if (client) {
            sendRpcMsg(client, rpcInvoke, args);
        }
    };
}
/**
 * rpc本服务器回调
 */
function getCallBackFuncSelf(id) {
    return function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        var timeout = rpcRequest[id];
        if (timeout) {
            delRequest(id);
            clearTimeout(timeout.timer);
            timeout.cb.apply(null, args);
        }
    };
}
/**
 * rpc socket
 */
var rpc_client_proxy = /** @class */ (function () {
    function rpc_client_proxy(server) {
        this.socket = null;
        this.connect_timer = null;
        this.heartbeat_timer = null;
        this.heartbeat_timeout_timer = null;
        this.die = false;
        this.id = server.id;
        this.host = server.host;
        this.port = server.port;
        this.doConnect(0);
    }
    rpc_client_proxy.prototype.doConnect = function (delay) {
        if (this.die) {
            return;
        }
        var self = this;
        connectingClients[self.id] = this;
        this.connect_timer = setTimeout(function () {
            var connectCb = function () {
                app.logger(interfaceDefine_1.loggerType.info, interfaceDefine_1.componentName.rpcService, " connect to rpc server " + self.id + " success");
                delete connectingClients[self.id];
                clients.push(self);
                // 注册
                var loginBuf = Buffer.from(JSON.stringify({
                    sid: app.serverId,
                    serverToken: app.serverToken
                }));
                var buf = Buffer.allocUnsafe(loginBuf.length + 5);
                buf.writeUInt32BE(loginBuf.length + 1, 0);
                buf.writeUInt8(1 /* register */, 4);
                loginBuf.copy(buf, 5);
                tmpClient.send(buf);
                // 心跳包
                self.heartbeat();
            };
            var tmpClient = new tcpClient_1.TcpClient(self.port, self.host, connectCb);
            app.logger(interfaceDefine_1.loggerType.info, interfaceDefine_1.componentName.rpcService, " try to connect to rpc server " + self.id);
            self.socket = tmpClient;
            tmpClient.on("data", self.onData.bind(self));
            tmpClient.on("close", self.onClose.bind(self));
        }, delay);
    };
    rpc_client_proxy.prototype.removeFromClients = function () {
        var index = clients.indexOf(this);
        if (index !== -1) {
            clients.splice(index, 1);
        }
    };
    rpc_client_proxy.prototype.onClose = function () {
        clearTimeout(this.heartbeat_timer);
        clearTimeout(this.heartbeat_timeout_timer);
        this.removeFromClients();
        this.socket = null;
        app.logger(interfaceDefine_1.loggerType.warn, interfaceDefine_1.componentName.rpcService, "socket closed, reconnect the rpc server " + this.id + " later");
        this.doConnect(define.some_config.Time.Rpc_Reconnect_Time * 1000);
    };
    rpc_client_proxy.prototype.heartbeat = function () {
        var self = this;
        this.heartbeat_timer = setTimeout(function () {
            var buf = Buffer.allocUnsafe(5);
            buf.writeUInt32BE(1, 0);
            buf.writeUInt8(2 /* heartbeat */, 4);
            self.send(buf);
            self.heartbeatTimeout();
            self.heartbeat();
        }, define.some_config.Time.Rpc_Heart_Beat_Time * 1000);
    };
    rpc_client_proxy.prototype.heartbeatTimeout = function () {
        var self = this;
        this.heartbeat_timeout_timer = setTimeout(function () {
            app.logger(interfaceDefine_1.loggerType.warn, interfaceDefine_1.componentName.rpcService, "heartbeat timeout, close the socket " + self.id);
            self.socket.close();
        }, define.some_config.Time.Rpc_Heart_Beat_Timeout_Time * 1000);
    };
    rpc_client_proxy.prototype.send = function (buf) {
        this.socket.send(buf);
    };
    rpc_client_proxy.prototype.onData = function (data) {
        var type = data.readUInt8(0);
        if (type === 1 /* msg */) {
            try {
                this.dealMsg(data);
            }
            catch (e) {
                app.logger(interfaceDefine_1.loggerType.error, interfaceDefine_1.componentName.rpcService, e);
            }
        }
        else if (type === 2 /* heartbeatResponse */) {
            clearTimeout(this.heartbeat_timeout_timer);
        }
    };
    rpc_client_proxy.prototype.dealMsg = function (data) {
        var iMsgLen = data.readUInt8(1);
        var iMsg = JSON.parse(data.slice(2, 2 + iMsgLen).toString());
        var msg = JSON.parse(data.slice(2 + iMsgLen).toString());
        if (!iMsg.from) {
            var timeout = rpcRequest[iMsg.id];
            if (timeout) {
                delRequest(iMsg.id);
                clearTimeout(timeout.timer);
                timeout.cb.apply(null, msg);
            }
        }
        else {
            var cmd = iMsg.route.split('.');
            if (iMsg.id) {
                msg.push(getCallBackFunc(iMsg.from, iMsg.id));
            }
            var file = msgHandler[cmd[0]];
            file[cmd[1]].apply(file, msg);
        }
    };
    rpc_client_proxy.prototype.close = function () {
        this.die = true;
        if (this.socket) {
            this.socket.close();
        }
        if (connectingClients[this.id] = this) {
            delete connectingClients[this.id];
        }
        clearTimeout(this.connect_timer);
    };
    return rpc_client_proxy;
}());
