/**
 * cli command processing module such as mydog list
 */


import Application from "../application";
import * as define from "../util/define";
import { Master, Master_CLI_Proxy, Master_ServerProxy } from "./master";
import { monitor_client_proxy } from "./monitor";

let serverTypeSort: string[] = [];

interface requset {
    cb: Function;
    timeOut: NodeJS.Timeout;
}

export class MasterCli {
    private app: Application;
    private master: Master;
    private monitorRequests: { [reqId: number]: requset } = {};
    private reqId: number = 1;
    private exiting = false;    // 进程是否正在退出
    constructor(app: Application, master: Master) {
        this.app = app;
        this.master = master;
        serverTypeSort.push("master");
        for (let svrType in app.serversConfig) {
            serverTypeSort.push(svrType);
        }
    }

    deal_cli_msg(socket: Master_CLI_Proxy, data: any) {
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

    private async func_list(reqId: number, socket: Master_CLI_Proxy, args: any) {
        let self = this;
        let num = 0;
        for (const [sid, serverProxy] of this.master.getServersMap()) {
            num++;
            this.send_to_monitor(serverProxy, { "func": "list" }, 10, cb)
        }
        let titles = ["id", "serverType", "pid", "rss(M)", "upTime(d-h-m)"];
        let infos = getListInfo(this.app);
        let listFunc = this.app.someconfig.mydogList;
        if (typeof listFunc === "function") {
            let resArr = await listFunc();
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

    private func_stop(reqId: number, socket: Master_CLI_Proxy, args: string[]) {
        let num = 0;
        for (const [sid] of this.master.getServersMap()) {
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

        for (const [sid, serverProxy] of this.master.getServersMap()) {
            this.send_to_monitor(serverProxy, { "func": "stop" }, 3600, cb);
        }

        function cb(err: any, data: any) {
            num--;
            if (num <= 0) {
                socket.send({ "reqId": reqId });
                exitCall();
            }
        }
    }


    private func_remove(reqId: number, socket: Master_CLI_Proxy, args: string[]) {
        args = Array.from(new Set(args));
        let num = 0;
        for (let i = 0; i < args.length; i++) {
            const serverProxy = this.master.getServer(args[i]);
            if (!serverProxy) {
                continue;
            }
            num++;
            this.send_to_monitor(serverProxy, { "func": "remove" }, 3600, cb);
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

    private func_removeT(reqId: number, socket: Master_CLI_Proxy, args: string[]) {
        args = Array.from(new Set(args));
        let num = 0;
        for (const [sid, serverProxy] of this.master.getServersMap()) {
            if (args.indexOf(serverProxy.serverType) === -1) {
                continue;
            }
            num++;
            this.send_to_monitor(serverProxy, { "func": "removeT" }, 3600, cb);
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


    private async func_list(reqId: number, socket: monitor_client_proxy, args: any) {
        let infos = getListInfo(this.app);
        let listFunc = this.app.someconfig.mydogList;
        if (typeof listFunc === "function") {
            let resArr = await listFunc();
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

    private async func_stop(reqId: number, socket: monitor_client_proxy, args: any) {
        let msg = {
            "T": define.Monitor_To_Master.cliMsg,
            "reqId": reqId,
        };
        if (this.exiting) {
            return;
        }
        this.exiting = true;
        try {
            let exitFunc = this.app.someconfig.onBeforeExit;
            if (exitFunc) {
                await exitFunc();
            }
        } finally {
            this.send_to_master(socket, msg);
            exitCall();
        }
    }

    private async func_remove(reqId: number, socket: monitor_client_proxy, args: any) {
        let msg = {
            "T": define.Monitor_To_Master.cliMsg,
            "reqId": reqId,
        };
        if (this.exiting) {
            return;
        }
        this.exiting = true;
        try {
            let exitFunc = this.app.someconfig.onBeforeExit;
            if (exitFunc) {
                await exitFunc();
            }
        } finally {
            this.send_to_master(socket, msg);
            exitCall();
        }

    }

    private async func_removeT(reqId: number, socket: monitor_client_proxy, args: any) {
        let msg = {
            "T": define.Monitor_To_Master.cliMsg,
            "reqId": reqId,
        };
        if (this.exiting) {
            return;
        }
        this.exiting = true;

        try {
            let exitFunc = this.app.someconfig.onBeforeExit;
            if (exitFunc) {
                await exitFunc();
            }
        } finally {
            this.send_to_master(socket, msg);
            exitCall();
        }
    }
}

/** 进程 1s 后退出 */
function exitCall() {
    setTimeout(() => {
        process.exit();
    }, 1000);
}