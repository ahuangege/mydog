/**
 * cli command processing module such as mydog list
 */


import Application from "../application";
import define = require("../util/define");
import { Master_ServerProxy, Master_ClientProxy } from "./master";
import { monitor_client_proxy } from "./monitor";

let serverTypeSort: string[] = [];

interface requset {
    cb: Function;
    timeOut: NodeJS.Timeout;
}

export class MasterCli {
    private app: Application;
    private servers: { [id: string]: Master_ServerProxy };
    private monitorRequests: { [reqId: number]: requset } = {};
    private reqId: number = 1;
    constructor(app: Application, servers: { [id: string]: Master_ServerProxy }) {
        this.app = app;
        this.servers = servers;
        serverTypeSort.push("master");
        for (let svrType in app.serversConfig) {
            serverTypeSort.push(svrType);
        }
    }

    deal_cli_msg(socket: Master_ClientProxy, data: any) {
        let reqId = data.reqId;
        data = data.msg;
        if ((this as any)["func_" + data.func]) {
            (this as any)["func_" + data.func](reqId, socket, data.args);
        }
    }

    deal_monitor_msg(data: { reqId: number; msg: any }) {
        let req = this.monitorRequests[data.reqId];
        if (req) {
            delete this.monitorRequests[data.reqId];
            clearTimeout(req.timeOut);
            req.cb(null, data.msg);
        }
    }

    private send_to_monitor(socket: Master_ServerProxy, msg: any, cb?: Function) {
        let data = { "T": define.Master_To_Monitor.cliMsg, "msg": msg } as any;
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
            }
        }
        socket.send(data);
    }

    private func_list(reqId: number, socket: Master_ClientProxy, args: any) {
        let self = this;
        let num = 0;
        for (let sid in this.servers) {
            num++;
            this.send_to_monitor(this.servers[sid], { "func": "list" }, cb)
        }
        let titles = ["id", "serverType", "pid", "rss(M)", "upTime(d-h-m)"];
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
        let serverInfoArr: string[][] = [];
        serverInfoArr.push(titles);
        serverInfoArr.push(infos);
        if (num === 0) {
            cb("no other server", null);
        }
        function cb(err: any, data: any) {
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

    private func_stop(reqId: number, socket: Master_ClientProxy, args: string[]) {
        let num = 0;
        for (let sid in this.servers) {
            num++;
            this.send_to_monitor(this.servers[sid], { "func": "stop" }, cb);
        }
        if (num === 0) {
            cb("no server", null);
        }
        function cb(err: any, data: any) {
            num--;
            if (num <= 0) {
                socket.send({ "reqId": reqId });
                setTimeout(() => {
                    process.exit();
                }, 1000);
            }
        }
    }


    private func_remove(reqId: number, socket: Master_ClientProxy, args: any) {
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
        function cb(err: any, data: any) {
            num--;
            if (num <= 0) {
                socket.send({ "reqId": reqId });
            }
        }
    }

    private func_removeT(reqId: number, socket: Master_ClientProxy, args: string[]) {
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
        function cb(err: any, data: any) {
            num--;
            if (num <= 0) {
                socket.send({ "reqId": reqId });
            }
        }
    }

}

function getListInfo(app: Application) {
    let mem = process.memoryUsage();
    let Mb = 1024 * 1024;
    return [app.serverId, app.serverType, process.pid.toString(), Math.floor(mem.rss / Mb).toString(), formatTime(app.startTime)];
}

function formatTime(time: number) {
    time = Math.floor((Date.now() - time) / 1000);
    var days = Math.floor(time / (24 * 3600));
    time = time % (24 * 3600);
    var hours = Math.floor(time / 3600);
    time = time % 3600;
    var minutes = Math.ceil(time / 60);
    return days + "-" + hours + "-" + minutes;
}



export class MonitorCli {
    private app: Application;
    constructor(app: Application) {
        this.app = app;
    }

    deal_master_msg(socket: monitor_client_proxy, data: any) {
        let reqId = data.reqId;
        data = data.msg;
        if ((this as any)["func_" + data.func]) {
            (this as any)["func_" + data.func](reqId, socket, data.args);
        }
    }

    private send_to_master(socket: monitor_client_proxy, msg: any) {
        socket.send(msg);
    }


    private func_list(reqId: number, socket: monitor_client_proxy, args: any) {
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
            "T": define.Monitor_To_Master.cliMsg,
            "reqId": reqId,
            "msg": infos
        };
        this.send_to_master(socket, msg);
    }

    private func_stop(reqId: number, socket: monitor_client_proxy, args: any) {
        let msg = {
            "T": define.Monitor_To_Master.cliMsg,
            "reqId": reqId,
        };
        this.send_to_master(socket, msg);
        setTimeout(() => {
            process.exit();
        }, 1000);
    }

    private func_remove(reqId: number, socket: monitor_client_proxy, args: any) {
        let msg = {
            "T": define.Monitor_To_Master.cliMsg,
            "reqId": reqId,
        };
        this.send_to_master(socket, msg);
        setTimeout(() => {
            process.exit();
        }, 1000);
    }

    private func_removeT(reqId: number, socket: monitor_client_proxy, args: any) {
        let msg = {
            "T": define.Monitor_To_Master.cliMsg,
            "reqId": reqId,
        };
        this.send_to_master(socket, msg);
        setTimeout(() => {
            process.exit();
        }, 1000);
    }
}