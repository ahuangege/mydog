var nowFileName = "rpcService.js";
var fs = require("fs");
var path = require("path");
var tcpClient = require("./tcpClient.js");
var msgCoder = require("./msgCoder.js");
var define = require("../util/define.js");

var app = null;
var connectingClients = {};
var index = 1;
var clients = [];
var msgHandler = null;
var rpcId = 1;
var rpcRequest = {};

var rpcService = module.exports;

rpcService.init = function (_app) {
    app = _app;
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
    var dirName = path.join(app.base, define.FILE_DIR.SERVERS);
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
                server[name] = remote(app);
            });
        }
        rpc[serverName] = {};
        for (var name in server) {
            rpc[serverName][name] = initFunc(name, server[name]);
        }
        if (serverName === app.serverType) {
            msgHandler = server;
        }
    });
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

            var loginInfo = {
                T: 2,
                sid: app.serverId,
                serverToken: app.serverToken
            };
            loginInfo = msgCoder.encodeInnerData(loginInfo);
            tmpClient.send(loginInfo);
        };
        var tmpClient = new tcpClient(server.port, server.host, connectCb);
        tmpSocket.socket = tmpClient;
        tmpClient.on("data", function (data) {
            dealMsg(JSON.parse(data));
        });
        tmpClient.on("close", function () {
            app.logger(nowFileName, "error", "- " + app.serverId + " rpc connect fail " + server.id + " -- reconnect " + define.TIME.RPC_RECONNECT + "s later");
            doConnect(server, define.TIME.RPC_RECONNECT * 1000);
        });

    }, delay);
}


function getRpcId() {
    var id = rpcId++;
    if (rpcId > 99999) {
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


function proxyCB(fileName, methodName) {
    return function () {
        var args = Array.prototype.slice.call(arguments, 0);
        var cb = null;
        if (typeof args[args.length - 1] === "function") {
            cb = args.pop();
        }
        var client = getRpcSocket();
        if (!client) {
            app.logger(nowFileName, "error", "- " + app.serverId + " has no rpc server ");
            if (cb) {
                cb({"code": -2, "info": "has no rpc server"});
            }
            return;
        }
        var rpcInvoke = {};
        rpcInvoke["T"] = 1;
        rpcInvoke["from"] = app.serverId;
        rpcInvoke["to"] = args.shift();
        if (cb) {
            rpcInvoke["id"] = getRpcId();
            rpcRequest[rpcInvoke.id] = {
                "cb": cb,
                "time": 0
            };
        }
        rpcInvoke['route'] = fileName + '.' + methodName;
        rpcInvoke['data'] = args;
        var data = msgCoder.encodeInnerData(rpcInvoke);
        client.send(data);
    }
}

function initFunc(fileName, obj) {
    var res = {};
    for (var field in obj) {
        if (typeof obj[field] === "function") {
            res[field] = proxyCB(fileName, field);
        }
    }
    return res;
}

function removeFromClients(id) {
    for (var i = 0; i < clients.length; i++) {
        if (clients[i].sid === id) {
            clients.splice(i, 1);
            break;
        }
    }
}


function dealMsg(msg) {
    if (!msg.from) {
        if (rpcRequest[msg.id]) {
            rpcRequest[msg.id].cb(msg.err, msg.data);
            delRequest(msg.id);
        }
    } else {
        var cmd = msg.route.split('.');
        if (msg.id) {
            var cb = getCallBackFunc(msg.from, msg.id);
            msg.data.push(cb);
        }
        var file = msgHandler[cmd[0]];
        file[cmd[1]].apply(file, msg.data);
    }
}

function getCallBackFunc(to, id) {
    return function (data) {
        var rpcInvoke = {};
        rpcInvoke["T"] = 1;
        rpcInvoke["to"] = to;
        rpcInvoke["id"] = id;
        rpcInvoke["data"] = data;
        rpcInvoke = msgCoder.encodeInnerData(rpcInvoke);
        var client = getRpcSocket();
        if (client) {
            client.send(rpcInvoke);
        } else {
            app.logger(nowFileName, "error", "- " + app.serverId + " has no rpc server ");
        }
    }
}


function clearRpcTimeOut() {
    setTimeout(function () {
        var tmp;
        for (var id in rpcRequest) {
            tmp = rpcRequest[id];
            tmp.time += 3;
            if (tmp.time > 10) {
                delRequest(id);
                app.logger(nowFileName, "error", "- rpc time out");
                try {
                    tmp.cb({"code": -1, "info": "rpc time out"});
                } catch (err) {
                    app.logger(nowFileName, "error", err.stack);
                }
            }
        }
        clearRpcTimeOut();
    }, 3000);
}