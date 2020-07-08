"use strict";
/**
 * mydog list 等cli命令处理模块
 */
Object.defineProperty(exports, "__esModule", { value: true });
var serverTypeSort = [];
var MasterCli = /** @class */ (function () {
    function MasterCli(app, servers) {
        this.monitorRequests = {};
        this.reqId = 1;
        this.app = app;
        this.servers = servers;
        serverTypeSort.push("master");
        for (var svrType in app.serversConfig) {
            serverTypeSort.push(svrType);
        }
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
        var data = { "T": 3 /* cliMsg */, "msg": msg };
        if (cb) {
            var _reqId_1 = this.reqId++;
            data["reqId"] = _reqId_1;
            var self_1 = this;
            this.monitorRequests[_reqId_1] = {
                "cb": cb,
                "timeOut": setTimeout(function () {
                    delete self_1.monitorRequests[_reqId_1];
                    cb("time out");
                }, 10 * 1000)
            };
        }
        socket.send(data);
    };
    MasterCli.prototype.func_list = function (reqId, socket, args) {
        var self = this;
        var num = 0;
        for (var sid in this.servers) {
            num++;
            this.send_to_monitor(this.servers[sid], { "func": "list" }, cb);
        }
        var titles = ["id", "serverType", "pid", "rss(M)", "upTime(d/h/m)"];
        var infos = getListInfo(this.app);
        var listFunc = this.app.mydoglistFunc;
        if (typeof listFunc === "function") {
            var resArr = listFunc();
            if (resArr && Array.isArray(resArr)) {
                for (var _i = 0, resArr_1 = resArr; _i < resArr_1.length; _i++) {
                    var one = resArr_1[_i];
                    titles.push(one.title);
                    infos.push(one.value);
                }
            }
        }
        var serverInfoArr = [];
        serverInfoArr.push(titles);
        serverInfoArr.push(infos);
        if (num === 0) {
            cb("no other server", null);
        }
        function cb(err, data) {
            if (!err) {
                serverInfoArr.push(data);
            }
            num--;
            if (num <= 0) {
                socket.send({
                    "reqId": reqId,
                    "msg": {
                        "name": self.app.appName,
                        "env": self.app.env,
                        "serverTypeSort": serverTypeSort,
                        "infoArr": serverInfoArr,
                    }
                });
            }
        }
    };
    MasterCli.prototype.func_stop = function (reqId, socket, args) {
        var num = 0;
        for (var sid in this.servers) {
            num++;
            this.send_to_monitor(this.servers[sid], { "func": "stop" }, cb);
        }
        if (num === 0) {
            cb("no server", null);
        }
        function cb(err, data) {
            num--;
            if (num <= 0) {
                socket.send({ "reqId": reqId });
                process.exit();
            }
        }
    };
    MasterCli.prototype.func_remove = function (reqId, socket, args) {
        var num = 0;
        for (var i = 0; i < args.length; i++) {
            if (!this.servers[args[i]]) {
                continue;
            }
            num++;
            this.send_to_monitor(this.servers[args[i]], { "func": "remove" }, cb);
        }
        if (num === 0) {
            cb("no server", null);
        }
        function cb(err, data) {
            num--;
            if (num <= 0) {
                socket.send({ "reqId": reqId });
            }
        }
    };
    return MasterCli;
}());
exports.MasterCli = MasterCli;
function getListInfo(app) {
    var mem = process.memoryUsage();
    var Mb = 1024 * 1024;
    return [app.serverId, app.serverType, process.pid.toString(), Math.floor(mem.rss / Mb).toString(), formatTime(app.startTime)];
}
function formatTime(time) {
    time = Math.floor((Date.now() - time) / 1000);
    var days = Math.floor(time / (24 * 3600));
    time = time % (24 * 3600);
    var hours = Math.floor(time / 3600);
    time = time % 3600;
    var minutes = Math.ceil(time / 60);
    return days + "/" + hours + "/" + minutes;
}
var MonitorCli = /** @class */ (function () {
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
    ;
    MonitorCli.prototype.send_to_master = function (socket, msg) {
        socket.send(msg);
    };
    ;
    MonitorCli.prototype.func_list = function (reqId, socket, args) {
        var infos = getListInfo(this.app);
        var listFunc = this.app.mydoglistFunc;
        if (typeof listFunc === "function") {
            var resArr = listFunc();
            if (resArr && Array.isArray(resArr)) {
                for (var _i = 0, resArr_2 = resArr; _i < resArr_2.length; _i++) {
                    var one = resArr_2[_i];
                    infos.push(one.value);
                }
            }
        }
        var msg = {
            "T": 3 /* cliMsg */,
            "reqId": reqId,
            "msg": infos
        };
        this.send_to_master(socket, msg);
    };
    ;
    MonitorCli.prototype.func_stop = function (reqId, socket, args) {
        var msg = {
            "T": 3 /* cliMsg */,
            "reqId": reqId,
        };
        this.send_to_master(socket, msg);
        process.exit();
    };
    ;
    MonitorCli.prototype.func_remove = function (reqId, socket, args) {
        var msg = {
            "T": 3 /* cliMsg */,
            "reqId": reqId,
        };
        this.send_to_master(socket, msg);
        process.exit();
    };
    ;
    return MonitorCli;
}());
exports.MonitorCli = MonitorCli;
