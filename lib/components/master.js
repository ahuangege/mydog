var nowFileName = __filename;
var tcpServer = require("./tcpServer.js");
var starter = require("../util/starter.js");
var msgCoder = require("./msgCoder.js");
var define = require("../util/define.js");
var cliUtil = require("./cliUtil.js");

var servers = {};
var app = null;
var serversDataTmp = {"T": define.Master_To_Monitor.addServer, "serverInfo": {}};
var masterCli = null;

module.exports.start = function (_app, cb) {
    app = _app;
    masterCli = cliUtil.newMasterCli(app, servers);
    startServer(cb);
};

/**
 * socket尚未注册时，关闭的回调
 */
var unRegSocketCloseHandle = function () {
    clearTimeout(this.registerTimer);
    clearTimeout(this.heartBeatTimer);
};

/**
 * socket尚未注册时，收到消息的回调
 */
var unRegSocketMsgHandle = function (data) {
    try {
        data = JSON.parse(data);
    } catch (err) {
        app.logger(nowFileName, "error", "[unRegSocketMsgHandle] JSON parse error，close the socket");
        this.close();
        return;
    }

    if (!data || data.T !== define.Monitor_To_Master.register) {
        app.logger(nowFileName, "error", "[unRegSocketMsgHandle] illegal data, close the socket");
        this.close();
        return;
    }

    // 判断是服务器，还是cli
    if (data.hasOwnProperty("serverToken")) {
        if (data.serverToken !== app.serverToken || !data.serverType || !data.serverInfo
            || !data.serverInfo.id || !data.serverInfo.host || !data.serverInfo.port) {
            app.logger(nowFileName, "error", "[unRegSocketMsgHandle] illegal register server data, close the socket");
            this.close();
            return;
        }
        new ServerProxy(data, this);
        return;
    }

    // 是cli？
    if (data.hasOwnProperty("clientToken") && data.clientToken === app.clientToken) {
        new ClientProxy(this);
        return;
    }

    app.logger(nowFileName, "error", "[unRegSocketMsgHandle] illegal register data, close the socket");
    this.close();
};

function startServer(cb) {
    var startCb = function () {
        console.log("server start: " + app.host + ":" + app.port + " / " + app.serverId);
        cb && cb();
        if (app.startMode === "all") {
            starter.runServers(app);
        }
    };
    var newClientCb = function (socket) {

        socket.unRegSocketMsgHandle = unRegSocketMsgHandle.bind(socket);
        socket.on('data', socket.unRegSocketMsgHandle);

        socket.unRegSocketCloseHandle = unRegSocketCloseHandle.bind(socket);
        socket.on('close', socket.unRegSocketCloseHandle);

        socket.registerTimer = setTimeout(function () {
            app.logger(nowFileName, "error", "master : register time out");
            socket.close();
        }, 10000);

        heartBeatTimeOut(socket);

    };
    var server = new tcpServer(app.port, startCb, newClientCb);
}


function heartBeatTimeOut(socket) {
    clearTimeout(socket.heartBeatTimer);
    socket.heartBeatTimer = setTimeout(function () {
        app.logger(nowFileName, "error", "monitor heartBeat time out", socket.serverInfo);
        socket.close();
    }, define.Time.Monitor_Heart_Beat_Time * 1000 * 2);
}


// 服务器代理
function ServerProxy(data, socket) {
    this.socket = socket;
    this.init(data)
}

ServerProxy.prototype.init = function (data) {
    var socket = this.socket;
    if (!!servers[data.serverInfo.id]) {
        app.logger(nowFileName, "error", "master already has a server named " + data.serverInfo.id);
        socket.close();
        return;
    }

    socket.removeListener("data", socket.unRegSocketMsgHandle);
    socket.unRegSocketMsgHandle = null;
    socket.on('data', this.processMsg.bind(this));

    socket.removeListener("close", socket.unRegSocketCloseHandle);
    socket.unRegSocketCloseHandle = null;
    socket.on('close', this.onClose.bind(this));


    clearTimeout(socket.registerTimer);

    socket.sid = data.serverInfo.id;
    socket.serverType = data.serverType;

    var socketInfo = {
        "T": define.Master_To_Monitor.addServer,
        "serverInfo": {}
    };
    socketInfo.serverInfo[socket.sid] = {
        "serverType": data.serverType,
        "serverInfo": data.serverInfo
    };
    socketInfo = msgCoder.encodeInnerData(socketInfo);

    // 向其他服务器通知,有新的服务器
    var server;
    for (var sid in servers) {
        server = servers[sid].socket;
        if (server.serverType !== "rpc") {
            server.send(socketInfo);
        }
    }

    // 通知新加入的服务器，当前已经有哪些服务器了
    if (socket.serverType !== "rpc") {
        var result = msgCoder.encodeInnerData(serversDataTmp);
        socket.send(result);
    }

    servers[socket.sid] = this;
    serversDataTmp.serverInfo[socket.sid] = {
        "serverType": data.serverType,
        "serverInfo": data.serverInfo
    };

    app.logger(nowFileName, "info", "master get a new server named " + socket.sid);
};

ServerProxy.prototype.send = function (msg) {
    this.socket.send(msgCoder.encodeInnerData(msg));
};

ServerProxy.prototype.processMsg = function (data) {
    try {
        data = JSON.parse(data);
    } catch (err) {
        app.logger(nowFileName, "error", "JSON parse error，close the server named " + this.socket.sid);
        this.socket.close();
        return;
    }
    if (data.T === define.Monitor_To_Master.heartbeat) {
        heartBeatTimeOut(this.socket);
    } else if (data.T === define.Monitor_To_Master.cliMsg) {
        masterCli.deal_monitor_msg(data);
    }
};

ServerProxy.prototype.onClose = function () {
    var socket = this.socket;
    clearTimeout(socket.registerTimer);
    clearTimeout(socket.heartBeatTimer);
    if (socket.sid) {
        delete servers[socket.sid];
        delete serversDataTmp.serverInfo[socket.sid];
        var serverInfo = {
            "T": define.Master_To_Monitor.removeServer,
            "id": socket.sid,
            "serverType": socket.serverType
        };
        serverInfo = msgCoder.encodeInnerData(serverInfo);
        for (var sid in servers) {
            if (servers[sid].socket.serverType !== "rpc") {
                servers[sid].socket.send(serverInfo);
            }
        }
        app.logger(nowFileName, "info", "the server  disconnect : " + socket.sid);
    }
};


// 连接到master的外部cli代理
function ClientProxy(socket) {
    this.socket = socket;
    this.init()
}

ClientProxy.prototype.init = function () {
    var socket = this.socket;
    socket.removeListener("data", socket.unRegSocketMsgHandle);
    socket.unRegSocketMsgHandle = null;
    socket.on('data', this.processMsg.bind(this));

    socket.removeListener("close", socket.unRegSocketCloseHandle);
    socket.unRegSocketCloseHandle = null;
    socket.on('close', this.onClose.bind(this));

    clearTimeout(socket.registerTimer);
};

ClientProxy.prototype.processMsg = function (data) {
    try {
        data = JSON.parse(data);
    } catch (err) {
        app.logger(nowFileName, "error", "[client proxy] JSON parse error，close the socket");
        this.socket.close();
        return;
    }
    if (data.T === define.Cli_To_Master.heartbeat) {
        heartBeatTimeOut(this.socket);
    } else if (data.T === define.Cli_To_Master.cliMsg) {
        masterCli.deal_cli_msg(this, data);
    }
};

ClientProxy.prototype.send = function (msg) {
    this.socket.send(msgCoder.encodeInnerData(msg));
};

ClientProxy.prototype.onClose = function () {
    var socket = this.socket;
    clearTimeout(socket.registerTimer);
    clearTimeout(socket.heartBeatTimer);
};