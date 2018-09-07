var msgCoder = require("./msgCoder.js");
var define = require("../util/define.js");

function MasterCli(app, servers) {
    this.app = app;
    this.servers = servers;
    this.monitorRequests = {};
    this.reqId = 1;

}

MasterCli.prototype.deal_cli_msg = function (socket, data) {
    var reqId = data.reqId;
    data = data.msg;
    if (this["func_" + data.func]) {
        this["func_" + data.func](reqId, socket, data.args);
    }
};

MasterCli.prototype.deal_monitor_msg = function (data) {
    var req = this.monitorRequests[data.reqId];
    if (req) {
        delete this.monitorRequests[data.reqId];
        clearTimeout(req.timeOut);
        req.cb(null, data.msg);
    }
};

MasterCli.prototype.send_to_monitor = function (socket, msg, cb) {
    var data = {"T": define.Master_To_Monitor.cliMsg, "msg": msg};
    if (cb) {
        var _reqId = this.reqId++;
        data["reqId"] = _reqId;
        var self = this;
        this.monitorRequests[_reqId] = {
            "cb": cb,
            "timeOut": setTimeout(function () {
                delete self.monitorRequests[_reqId];
                cb("time out");
            }, 10 * 1000)
        }
    }
    socket.send(data);
};

MasterCli.prototype.func_list = function (reqId, socket, args) {
    var nums = 0;
    for (var sid in this.servers) {
        nums++;
        this.send_to_monitor(this.servers[sid], {"func": "list"}, cb)
    }
    var serverInfoArr = [];
    serverInfoArr.push(getListInfo(this.app));

    function cb(err, data) {
        if (err) {
            return;
        }
        nums--;
        serverInfoArr.push(data);
        if (nums === 0) {
            socket.send({"reqId": reqId, "msg": serverInfoArr});
        }
    }
};

MasterCli.prototype.func_stop = function (reqId, socket, args) {
    for (var sid in this.servers) {
        this.send_to_monitor(this.servers[sid], {"func": "stop"});
    }
    setTimeout(function () {
        socket.send({"reqId": reqId});
        setTimeout(function () {
            process.exit();
        }, 500);
    }, 2000);
};


MasterCli.prototype.func_remove = function (reqId, socket, args) {
    for (var i = 0; i < args.length; i++) {
        if (!this.servers[args[i]]) {
            continue;
        }
        this.send_to_monitor(this.servers[args[i]], {"func": "remove"});
    }
    socket.send({"reqId": reqId});
};


function getListInfo(app) {
    var mem = process.memoryUsage();
    var Mb = 1024 * 1024;
    return {
        "id": app.serverId,
        "serverType": app.serverType,
        "rss": Math.floor(mem.rss / Mb),
        "heapTotal": Math.floor(mem.heapTotal / Mb),
        "heapUsed": Math.floor(mem.heapUsed / Mb),
        "pid": process.pid,
        "time": app.startTime
    };
}


function MonitorCli(app) {
    this.app = app;
}

MonitorCli.prototype.deal_master_msg = function (socket, data) {
    var reqId = data.reqId;
    data = data.msg;
    if (this["func_" + data.func]) {
        this["func_" + data.func](reqId, socket, data.args);
    }
};

MonitorCli.prototype.send_to_master = function (socket, msg) {
    socket.send(msgCoder.encodeInnerData(msg));
};


MonitorCli.prototype.func_list = function (reqId, socket, args) {
    var msg = {
        "T": define.Monitor_To_Master.cliMsg,
        "reqId": reqId,
        "msg": getListInfo(this.app)
    };
    this.send_to_master(socket, msg);
};

MonitorCli.prototype.func_stop = function (reqId, socket, args) {
    process.exit();
};

MonitorCli.prototype.func_remove = function (reqId, socket, args) {
    process.exit();
};

exports.newMasterCli = function (app, servers) {
    return new MasterCli(app, servers);
};

exports.newMonitorCli = function (app) {
    return new MonitorCli(app);
};