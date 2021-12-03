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
    private exiting = false;    // 进程是否正在退出
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

    private send_to_monitor(socket: Master_ServerProxy, msg: { "func": string, "args"?: any }, timeout: number, cb?: Function) {
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
                }, timeout * 1000)
            }
        }
        socket.send(data);
    }

    private func_list(reqId: number, socket: Master_ClientProxy, args: any) {
        let self = this;
        let num = 0;
        for (let sid in this.servers) {
            num++;
            this.send_to_monitor(this.servers[sid], { "func": "list" }, 10, cb)
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
        }
        if (num === 0) {
            cb("no server", null);
            return;
        }

        if (this.exiting) {
            socket.send({ "reqId": reqId });
            return;
        }
        this.exiting = true;

        for (let sid in this.servers) {
            this.send_to_monitor(this.servers[sid], { "func": "stop" }, 3600, cb);    // stop 会导致 master 也关闭，且master在其他服关闭后才能关闭，所以超时时间设为很久
        }

        function cb(err: any, data: any) {
            num--;
            if (num <= 0) {
                socket.send({ "reqId": reqId });
                exitCall();
            }
        }
    }


    private func_remove(reqId: number, socket: Master_ClientProxy, args: string[]) {
        let num = 0;
        for (let i = 0; i < args.length; i++) {
            if (!this.servers[args[i]]) {
                continue;
            }
            num++;
            this.send_to_monitor(this.servers[args[i]], { "func": "remove" }, 10, cb);
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
            this.send_to_monitor(one, { "func": "removeT" }, 10, cb);
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

    private func_send(reqId: number, socket: Master_ClientProxy, args: { "serverIds": string[], "serverTypes": string[], "argv": string[] }) {
        let okArr: Master_ServerProxy[] = [];
        if (args.serverIds) {
            for (let id of args.serverIds) {
                if (this.servers[id]) {
                    okArr.push(this.servers[id]);
                }
            }
        } else if (args.serverTypes) {
            for (let x in this.servers) {
                let one = this.servers[x];
                if (args.serverTypes.includes(one.serverType)) {
                    okArr.push(one);
                }
            }
        } else {
            for (let x in this.servers) {
                okArr.push(this.servers[x]);
            }
        }

        if (okArr.length === 0) {
            socket.send({
                "reqId": reqId,
                "msg": {
                    "err": "no target serverIds"
                }
            });
            return;
        }

        let num = okArr.length;
        let endData: { "id": string, "serverType": string, "data": any }[] = [];
        let timeoutIds: string[] = [];
        for (let one of okArr) {
            this.send_to_monitor(one, { "func": "send", "args": args.argv }, 60, (err: any, data: any) => {
                if (err) {
                    timeoutIds.push(one.sid);
                } else {
                    endData.push({ "id": one.sid, "serverType": one.serverType, "data": data });
                }
                num--;
                if (num <= 0) {
                    socket.send({ "reqId": reqId, "msg": { "err": "", "timeoutIds": timeoutIds, "data": endData } });
                }
            });
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
    private exiting = false;    // 进程是否正在退出
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
        if (this.exiting) {
            return;
        }
        this.exiting = true;
        let exitFunc = this.app.someconfig.onBeforeExit;
        if (exitFunc) {
            exitFunc(() => {
                this.send_to_master(socket, msg);
                exitCall();
            });
        } else {
            this.send_to_master(socket, msg);
            exitCall();
        }
    }

    private func_remove(reqId: number, socket: monitor_client_proxy, args: any) {
        let msg = {
            "T": define.Monitor_To_Master.cliMsg,
            "reqId": reqId,
        };
        this.send_to_master(socket, msg);
        if (this.exiting) {
            return;
        }
        this.exiting = true;
        let exitFunc = this.app.someconfig.onBeforeExit;
        if (exitFunc) {
            exitFunc(() => {
                exitCall();
            });
        } else {
            exitCall();
        }

    }

    private func_removeT(reqId: number, socket: monitor_client_proxy, args: any) {
        let msg = {
            "T": define.Monitor_To_Master.cliMsg,
            "reqId": reqId,
        };
        this.send_to_master(socket, msg);
        if (this.exiting) {
            return;
        }
        this.exiting = true;
        let exitFunc = this.app.someconfig.onBeforeExit;
        if (exitFunc) {
            exitFunc(() => {
                exitCall();
            });
        } else {
            exitCall();
        }
    }

    private func_send(reqId: number, socket: monitor_client_proxy, args: string[]) {
        let msg = {
            "T": define.Monitor_To_Master.cliMsg,
            "reqId": reqId,
            "msg": null,
        };
        let sendFunc = this.app.someconfig.onMydogSend;
        if (sendFunc) {
            sendFunc(args, (data) => {
                if (data === undefined) {
                    data = null;
                }
                msg.msg = data;
                this.send_to_master(socket, msg);
            });
        } else {
            this.send_to_master(socket, msg);
        }
    }
}

/** 进程 1s 后退出 */
function exitCall() {
    setTimeout(() => {
        process.exit();
    }, 1000);
}