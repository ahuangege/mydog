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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var interfaceDefine_1 = require("../util/interfaceDefine");
var path = __importStar(require("path"));
var fs = __importStar(require("fs"));
var define_1 = __importDefault(require("../util/define"));
var tcpClient_1 = require("./tcpClient");
var app;
var rpcRouter;
var servers;
var serversIdMap;
var connectingClients = {};
var client_index = 1;
var clients = [];
var msgHandler = {};
var rpcId = 1;
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
    new rpc_create();
    clearRpcTimeOut();
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
        var dirName = path.join(app.base, define_1.default.File_Dir.Servers);
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
                cb && cb({ "code": 1, "info": "no such end server " });
                return;
            }
            var rpcInvoke = {};
            rpcInvoke["from"] = app.serverId;
            rpcInvoke["to"] = sid;
            rpcInvoke["route"] = file_method;
            if (cb) {
                rpcInvoke["id"] = getRpcId();
                rpcRequest[rpcInvoke.id] = {
                    "cb": cb,
                    "time": Date.now() + rpcTimeMax
                };
            }
            var client = getRpcSocket();
            if (client) {
                sendRpcMsg(client, rpcInvoke, args);
            }
            else {
                cb && cb({ "code": 2, "info": "has no rpc server" });
            }
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
            cb && cb({ "code": 1, "info": app.serverId + " has no rpc server named " + toServerId });
            return;
        }
        var rpcInvoke = {};
        rpcInvoke["from"] = app.serverId;
        if (cb) {
            rpcInvoke["id"] = getRpcId();
            rpcRequest[rpcInvoke.id] = {
                "cb": cb,
                "time": Date.now() + rpcTimeMax
            };
        }
        rpcInvoke['route'] = file_method;
        rpcInvoke["to"] = toServerId;
        var client = getRpcSocket();
        if (client) {
            sendRpcMsg(client, rpcInvoke, args);
        }
        else {
            cb && cb({ "code": 2, "info": "has no rpc server" });
        }
    };
    rpc_create.prototype.proxyCbSendToServerType = function (serverType, file_method, args) {
        var cb = null;
        if (typeof args[args.length - 1] === "function") {
            cb = args.pop();
        }
        var endTo = [];
        for (var i = 0; i < servers[serverType].length; i++) {
            endTo.push(servers[serverType][i].id);
        }
        if (endTo.length === 0) {
            cb && cb(undefined, {});
        }
        var nums = endTo.length;
        var endCb = null;
        var bindCb = null;
        var called = false;
        var msgObj = {};
        var timeout = null;
        if (cb) {
            endCb = function (id, err, msg) {
                if (called) {
                    return;
                }
                nums--;
                if (err) {
                    clearTimeout(timeout);
                    called = true;
                    cb(err);
                    return;
                }
                msgObj[id] = msg;
                if (nums === 0) {
                    clearTimeout(timeout);
                    called = true;
                    cb(undefined, msgObj);
                }
            };
            timeout = setTimeout(function () {
                called = true;
                cb({ "code": 4, "info": "rpc time out" });
            }, 10000);
            bindCb = function (id) {
                return function (err, msg) {
                    endCb(id, err, msg);
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
            var rpcInvoke = {};
            rpcInvoke["from"] = app.serverId;
            if (callback) {
                rpcInvoke["id"] = getRpcId();
                rpcRequest[rpcInvoke.id] = {
                    "cb": callback,
                    "time": Date.now() + rpcTimeMax
                };
            }
            rpcInvoke['route'] = file_method;
            rpcInvoke["to"] = toId;
            var client = getRpcSocket();
            if (client) {
                sendRpcMsg(client, rpcInvoke, args);
            }
            else {
                callback && callback({ "code": 2, "info": "has no rpc server" });
            }
        }
    };
    return rpc_create;
}());
function getRpcId() {
    var id = rpcId++;
    if (rpcId > 999999) {
        rpcId = 1;
    }
    return id;
}
function getRpcSocket() {
    var socket = null;
    if (clients.length) {
        socket = clients[client_index % clients.length];
        client_index = (client_index + 1) % clients.length;
    }
    return socket;
}
function sendRpcMsg(client, iMsg, msg) {
    var iMsgBuf = Buffer.from(JSON.stringify(iMsg));
    var msgBuf = Buffer.from(JSON.stringify(msg));
    var buf = Buffer.allocUnsafe(6 + iMsgBuf.length + msgBuf.length);
    buf.writeUInt32BE(2 + iMsgBuf.length + msgBuf.length, 0);
    buf.writeUInt8(define_1.default.Rpc_Msg.msg, 4);
    buf.writeUInt8(iMsgBuf.length, 5);
    iMsgBuf.copy(buf, 6);
    msgBuf.copy(buf, 6 + iMsgBuf.length);
    client.send(buf);
}
/**
 * 删除rpc计时
 */
function delRequest(id) {
    delete rpcRequest[id];
}
/**
 * rpc 超时判断
 */
function clearRpcTimeOut() {
    setTimeout(function () {
        var nowTime = Date.now();
        var tmp;
        for (var id in rpcRequest) {
            tmp = rpcRequest[id];
            if (nowTime > tmp.time) {
                delRequest(id);
                try {
                    tmp.cb({ "code": 4, "info": "rpc time out" });
                }
                catch (err) {
                }
            }
        }
        clearRpcTimeOut();
    }, 3000);
}
/**
 * rpc回调
 */
function getCallBackFunc(to, id) {
    return function (data) {
        if (data === undefined) {
            data = null;
        }
        var rpcInvoke = { "to": to, "id": id };
        var client = getRpcSocket();
        if (client) {
            sendRpcMsg(client, rpcInvoke, data);
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
                buf.writeUInt8(define_1.default.Rpc_Msg.register, 4);
                loginBuf.copy(buf, 5);
                tmpClient.send(buf);
                // 心跳包
                self.heartbeat();
            };
            var tmpClient = new tcpClient_1.TcpClient(self.port, self.host, connectCb);
            self.socket = tmpClient;
            tmpClient.on("data", self.dealMsg.bind(self));
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
        this.removeFromClients();
        this.socket = null;
        app.logger(interfaceDefine_1.loggerType.warn, interfaceDefine_1.componentName.rpcService, "rpc connect " + this.id + " fail, reconnect later");
        this.doConnect(define_1.default.Time.Rpc_Reconnect_Time * 1000);
    };
    rpc_client_proxy.prototype.heartbeat = function () {
        var self = this;
        this.heartbeat_timer = setTimeout(function () {
            var buf = Buffer.allocUnsafe(5);
            buf.writeUInt32BE(1, 0);
            buf.writeUInt8(define_1.default.Rpc_Msg.heartbeat, 4);
            self.send(buf);
            self.heartbeat();
        }, define_1.default.Time.Rpc_Heart_Beat_Time * 1000);
    };
    rpc_client_proxy.prototype.send = function (buf) {
        this.socket.send(buf);
    };
    rpc_client_proxy.prototype.dealMsg = function (data) {
        var iMsgLen = data.readUInt8(0);
        var iMsg = JSON.parse(data.slice(1, 1 + iMsgLen).toString());
        var msg = JSON.parse(data.slice(1 + iMsgLen).toString());
        if (!iMsg.from) {
            if (rpcRequest[iMsg.id]) {
                rpcRequest[iMsg.id].cb(iMsg.err, msg);
                delRequest(iMsg.id);
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
