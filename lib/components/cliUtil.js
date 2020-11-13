"use strict";
/**
 * mydog list 等cli命令处理模块
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MonitorCli = exports.MasterCli = void 0;
let serverTypeSort = [];
class MasterCli {
    constructor(app, servers) {
        this.monitorRequests = {};
        this.reqId = 1;
        this.app = app;
        this.servers = servers;
        serverTypeSort.push("master");
        for (let svrType in app.serversConfig) {
            serverTypeSort.push(svrType);
        }
    }
    deal_cli_msg(socket, data) {
        let reqId = data.reqId;
        data = data.msg;
        if (this["func_" + data.func]) {
            this["func_" + data.func](reqId, socket, data.args);
        }
    }
    deal_monitor_msg(data) {
        let req = this.monitorRequests[data.reqId];
        if (req) {
            delete this.monitorRequests[data.reqId];
            clearTimeout(req.timeOut);
            req.cb(null, data.msg);
        }
    }
    send_to_monitor(socket, msg, cb) {
        let data = { "T": 3 /* cliMsg */, "msg": msg };
        if (cb) {
            let _reqId = this.reqId++;
            data["reqId"] = _reqId;
            let self = this;
            this.monitorRequests[_reqId] = {
                "cb": cb,
                "timeOut": setTimeout(function () {
                    delete self.monitorRequests[_reqId];
                    cb("time out");
                }, 10 * 1000)
            };
        }
        socket.send(data);
    }
    func_list(reqId, socket, args) {
        let self = this;
        let num = 0;
        for (let sid in this.servers) {
            num++;
            this.send_to_monitor(this.servers[sid], { "func": "list" }, cb);
        }
        let titles = ["id", "serverType", "pid", "rss(M)", "upTime(d/h/m)"];
        let infos = getListInfo(this.app);
        let listFunc = this.app.someconfig.mydogList;
        if (typeof listFunc === "function") {
            let resArr = listFunc();
            if (resArr && Array.isArray(resArr)) {
                for (let one of resArr) {
                    titles.push(one.title);
                    infos.push(one.value);
                }
            }
        }
        let serverInfoArr = [];
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
    }
    func_stop(reqId, socket, args) {
        let num = 0;
        for (let sid in this.servers) {
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
                setTimeout(() => {
                    process.exit();
                }, 1000);
            }
        }
    }
    func_remove(reqId, socket, args) {
        let num = 0;
        for (let i = 0; i < args.length; i++) {
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
    }
    func_removeT(reqId, socket, args) {
        let num = 0;
        for (let x in this.servers) {
            let one = this.servers[x];
            if (args.indexOf(one.serverType) === -1) {
                continue;
            }
            num++;
            this.send_to_monitor(one, { "func": "removeT" }, cb);
        }
        if (num === 0) {
            cb("no serverType", null);
        }
        function cb(err, data) {
            num--;
            if (num <= 0) {
                socket.send({ "reqId": reqId });
            }
        }
    }
}
exports.MasterCli = MasterCli;
function getListInfo(app) {
    let mem = process.memoryUsage();
    let Mb = 1024 * 1024;
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
class MonitorCli {
    constructor(app) {
        this.app = app;
    }
    deal_master_msg(socket, data) {
        let reqId = data.reqId;
        data = data.msg;
        if (this["func_" + data.func]) {
            this["func_" + data.func](reqId, socket, data.args);
        }
    }
    send_to_master(socket, msg) {
        socket.send(msg);
    }
    func_list(reqId, socket, args) {
        let infos = getListInfo(this.app);
        let listFunc = this.app.someconfig.mydogList;
        if (typeof listFunc === "function") {
            let resArr = listFunc();
            if (resArr && Array.isArray(resArr)) {
                for (let one of resArr) {
                    infos.push(one.value);
                }
            }
        }
        let msg = {
            "T": 3 /* cliMsg */,
            "reqId": reqId,
            "msg": infos
        };
        this.send_to_master(socket, msg);
    }
    func_stop(reqId, socket, args) {
        let msg = {
            "T": 3 /* cliMsg */,
            "reqId": reqId,
        };
        this.send_to_master(socket, msg);
        setTimeout(() => {
            process.exit();
        }, 1000);
    }
    func_remove(reqId, socket, args) {
        let msg = {
            "T": 3 /* cliMsg */,
            "reqId": reqId,
        };
        this.send_to_master(socket, msg);
        setTimeout(() => {
            process.exit();
        }, 1000);
    }
    func_removeT(reqId, socket, args) {
        let msg = {
            "T": 3 /* cliMsg */,
            "reqId": reqId,
        };
        this.send_to_master(socket, msg);
        setTimeout(() => {
            process.exit();
        }, 1000);
    }
}
exports.MonitorCli = MonitorCli;
