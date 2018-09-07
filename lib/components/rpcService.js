var nowFileName = __filename;
var fs = require("fs");
var path = require("path");
var tcpClient = require("./tcpClient.js");
var define = require("../util/define.js");

var app = null;
var rpcRouter = null;
var servers = null;
var serversIdMap = null;
var connectingClients = {};
var index = 1;
var clients = [];
var msgHandler = null;
var rpcId = 1;
var rpcRequest = {};

var rpcService = module.exports;

rpcService.init = function (_app) {
    app = _app;
    rpcRouter = app.rpcRouter;
    servers = app.servers;
    serversIdMap = app.serversIdMap;
    loadRemoteMethod();
    clearRpcTimeOut();
    app.rpcService = this;
};

rpcService.addRpcServer = function (server) {
    if (connectingClients[server.id]) {
        return;
    }
    for (var i = 0; i < clients.length; i++) {
        if (clients[i].sid === server.id) {
            return;
        }
    }
    doConnect(server, 0);
};


rpcService.removeRpcServer = function (id) {
    for (var i = 0; i < clients.length; i++) {
        if (clients[i].sid === id) {
            clients[i].close();
        }
    }
    if (connectingClients[id]) {
        if (connectingClients[id].socket) {
            connectingClients[id].socket.close();
        }
        clearTimeout(connectingClients[id].timer);
    }
};

function loadRemoteMethod() {
    var rpc = {};
    app.rpc = rpc;
    var dirName = path.join(app.base, define.File_Dir.Servers);
    var exists = fs.existsSync(dirName);
    if(!exists){
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
                } else if (typeof remote === "function") {
                    server[name] = new remote(app);
                }
            });
        }
        rpc[serverName] = {};
        for (var name in server) {
            rpc[serverName][name] = initFunc(serverName, name, server[name]);
        }
        if (serverName === app.serverType) {
            msgHandler = server;
        }
    });
}


function removeFromClients(id) {
    for (var i = 0; i < clients.length; i++) {
        if (clients[i].sid === id) {
            clients.splice(i, 1);
            break;
        }
    }
}


function doConnect(server, delay) {
    removeFromClients(server.id);
    var tmpSocket = {
        "timer": null
    };
    connectingClients[server.id] = tmpSocket;
    tmpSocket.timer = setTimeout(function () {
        var connectCb = function () {
            app.logger(nowFileName, "debug", "- " + app.serverId + " connect to rpc server: " + server.id);

            delete connectingClients[server.id];
            tmpClient.sid = server.id;
            clients.push(tmpClient);

            // 注册
            var loginBuf = Buffer.from(JSON.stringify({
                sid: app.serverId,
                serverToken: app.serverToken
            }));
            var buf = Buffer.allocUnsafe(loginBuf.length + 5);
            buf.writeUInt32BE(loginBuf.length + 1);
            buf.writeUInt8(define.Rpc_Msg.register, 4);
            loginBuf.copy(buf, 5);
            tmpClient.send(buf);

            // 心跳包
            heartBeat(tmpClient);
        };
        var tmpClient = new tcpClient(server.port, server.host, connectCb);
        tmpSocket.socket = tmpClient;
        tmpClient.on("data", dealMsg);
        tmpClient.on("close", function () {
            clearTimeout(tmpClient.heartBeatTimer);
            app.logger(nowFileName, "error", "- " + app.serverId + " rpc connect fail " + server.id + " -- reconnect " + define.Time.Rpc_Reconnect_Time + "s later");
            doConnect(server, define.Time.Rpc_Reconnect_Time * 1000);
        });

    }, delay);
}

function heartBeat(socket) {
    socket.heartBeatTimer = setTimeout(function () {
        var buf = Buffer.allocUnsafe(5);
        buf.writeUInt32BE(1);
        buf.writeUInt8(define.Rpc_Msg.heartbeat, 4);
        socket.send(buf);
        heartBeat(socket);
    }, define.Time.Rpc_Heart_Beat_Time * 1000)
}


function getRpcId() {
    var id = rpcId++;
    if (rpcId > 999999) {
        rpcId = 1;
    }
    return id;
}

function delRequest(id) {
    delete rpcRequest[id];
}

function getRpcSocket() {
    var socket = null;
    if (clients.length) {
        socket = clients[index % clients.length];
        index = (index + 1) % clients.length;
    }
    return socket;
}


function sendRpcMsg(client, iMsg, msg) {
    var iMsgBuf = Buffer.from(JSON.stringify(iMsg));
    var msgBuf = Buffer.from(JSON.stringify(msg));
    var buf = Buffer.allocUnsafe(6 + iMsgBuf.length + msgBuf.length);
    buf.writeUInt32BE(2 + iMsgBuf.length + msgBuf.length);
    buf.writeUInt8(define.Rpc_Msg.msg, 4);
    buf.writeUInt8(iMsgBuf.length, 5);
    iMsgBuf.copy(buf, 6);
    msgBuf.copy(buf, 6 + iMsgBuf.length);
    client.send(buf);
}


function proxyCbSend(serverType, file_method, args) {
    var cb = null;
    if (typeof args[args.length - 1] === "function") {
        cb = args.pop();
    }

    var cbFunc = function (err, sid) {
        if (err || !serversIdMap[sid]) {
            cb && cb({"code": 1, "info": err});
            return;
        }
        var rpcInvoke = {};
        rpcInvoke["from"] = app.serverId;
        rpcInvoke["to"] = sid;
        if (cb) {
            rpcInvoke["id"] = getRpcId();
            rpcRequest[rpcInvoke.id] = {
                "cb": cb,
                "time": 0
            };
        }
        rpcInvoke['route'] = file_method;

        var client = getRpcSocket();
        if (client) {
            sendRpcMsg(client, rpcInvoke, args);
        } else {
            cb && cb({"code": 2, "info": "has no rpc server"});
        }
    };

    var tmpRouter = rpcRouter[serverType];
    if (tmpRouter) {
        tmpRouter(app, args.shift(), cbFunc);
    } else {
        var list = servers[serverType];
        if (!list || !list.length) {
            cbFunc(app.serverId + " has no such rpc serverType: " + serverType);
        } else {
            var index = args.shift().toString().length % list.length;
            cbFunc(null, list[index].id);
        }
    }
}

function proxyCbSendToServer(serverType, file_method, args) {
    var to = args.shift();
    if (to === "*") {
        proxyCbSendToServerType(serverType, file_method, args);
        return;
    }

    var cb = null;
    if (typeof args[args.length - 1] === "function") {
        cb = args.pop();
    }

    if (!serversIdMap[to]) {
        cb && cb({"code": 1, "info": app.serverId + " has no rpc server named " + to});
        return;
    }

    var rpcInvoke = {};
    rpcInvoke["from"] = app.serverId;
    if (cb) {
        rpcInvoke["id"] = getRpcId();
        rpcRequest[rpcInvoke.id] = {
            "cb": cb,
            "time": 0
        };
    }
    rpcInvoke['route'] = file_method;
    rpcInvoke["to"] = to;
    var client = getRpcSocket();
    if (client) {
        sendRpcMsg(client, rpcInvoke, args);
    } else {
        cb && cb({"code": 2, "info": "has no rpc server"});
    }

}


function proxyCbSendToServerType(serverType, file_method, args) {
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
            cb({"code": 4, "info": "rpc time out"});
        }, 5000);
    }

    var bindCb = function (id) {
        return function (err, msg) {
            endCb(id, err, msg)
        };
    };

    var tmpCb = null;
    for (i = 0; i < endTo.length; i++) {
        if (cb) {
            tmpCb = bindCb(endTo[i]);
        }
        send(endTo[i], tmpCb)
    }

    function send(toId, callback) {
        var rpcInvoke = {};
        rpcInvoke["from"] = app.serverId;
        if (callback) {
            rpcInvoke["id"] = getRpcId();
            rpcRequest[rpcInvoke.id] = {
                "cb": callback,
                "time": 0
            };
        }
        rpcInvoke['route'] = file_method;
        rpcInvoke["to"] = toId;
        var client = getRpcSocket();
        if (client) {
            sendRpcMsg(client, rpcInvoke, args);
        } else {
            callback && callback({"code": 2, "info": "has no rpc server"});
        }
    }
}


function proxyCb(serverName, file_method) {
    var func = function () {
        var args = Array.prototype.slice.call(arguments, 0);
        proxyCbSend(serverName, file_method, args);
    };
    func.toServer = function () {
        var args = Array.prototype.slice.call(arguments, 0);
        proxyCbSendToServer(serverName, file_method, args);
    };
    return func;
}


function initFunc(serverName, fileName, obj) {
    var res = {};
    for (var field in obj) {
        if (typeof obj[field] === "function") {
            res[field] = proxyCb(serverName, fileName + "." + field);
        }
    }
    return res;
}

function dealMsg(data) {
    var iMsgLen = data.readUInt8();
    var iMsg = JSON.parse(data.slice(1, 1 + iMsgLen));
    var msg = JSON.parse(data.slice(1 + iMsgLen));
    if (!iMsg.from) {
        if (rpcRequest[iMsg.id]) {
            rpcRequest[iMsg.id].cb(iMsg.err, msg);
            delRequest(iMsg.id);
        }
    } else {
        var cmd = iMsg.route.split('.');
        if (iMsg.id) {
            var cb = getCallBackFunc(iMsg.from, iMsg.id);
            msg.push(cb);
        } else {
            msg.push(defaultCallBack);
        }
        var file = msgHandler[cmd[0]];
        file[cmd[1]].apply(file, msg);
    }
}

function getCallBackFunc(to, id) {
    return function (data) {
        if (data === undefined) {
            data = null;
        }
        var rpcInvoke = {"to": to, "id": id};
        var client = getRpcSocket();
        if (client) {
            sendRpcMsg(client, rpcInvoke, data);
        }
    }
}

function defaultCallBack() {

}

function clearRpcTimeOut() {
    setTimeout(function () {
        var tmp;
        for (var id in rpcRequest) {
            tmp = rpcRequest[id];
            tmp.time += 3;
            if (tmp.time > 10) {
                delRequest(id);
                try {
                    tmp.cb({"code": 4, "info": "rpc time out"});
                } catch (err) {
                    app.logger(nowFileName, "error", err.stack);
                }
            }
        }
        clearRpcTimeOut();
    }, 3000);
}