/**
 * rpc连接的管理，发送rpc消息
 */


import Application from "../application";
import { rpcRouteFunc, rpcTimeout, rpcErr, rpcMsg } from "../util/interfaceDefine";
import * as path from "path";
import * as fs from "fs";
import define = require("../util/define");

let app: Application;
let msgHandler: { [filename: string]: any } = {};
let rpcId = 1;  // 必须从1开始，不可为0
let rpcRequest: { [id: number]: rpcTimeout } = {};
let rpcTimeMax: number = 10 * 1000;

/**
 * 初始化
 * @param _app 
 */
export function init(_app: Application) {
    app = _app;
    if (app.rpcConfig.hasOwnProperty("timeout") && Number(app.rpcConfig["timeout"]) > 5) {
        rpcTimeMax = Number(app.rpcConfig["timeout"]) * 1000;
    }
    new rpc_create();
}


/**
 * 处理rpc消息
 */
export function handleMsg(id: string, msg: Buffer) {
    let data = JSON.parse(msg.slice(1).toString());
    let rpcInvoke: rpcMsg = data.pop();
    if (!rpcInvoke.route) {
        let timeout = rpcRequest[rpcInvoke.id as number];
        if (timeout) {
            delRequest(rpcInvoke.id as number);
            clearTimeout(timeout.timer);
            timeout.cb.apply(null, data);
        }
    } else {
        let cmd = (rpcInvoke.route as string).split('.');
        if (rpcInvoke.id) {
            data.push(getCallBackFunc(id, rpcInvoke.id));
        }
        let file = msgHandler[cmd[0]];
        file[cmd[1]].apply(file, data);
    }
}


/**
 * rpc构造
 */
class rpc_create {
    private toId: any = null;
    private rpcObj: Rpc = {};

    constructor() {
        this.loadRemoteMethod();
    }

    loadRemoteMethod() {
        let self = this;
        app.rpc = this.rpcFunc.bind(this);
        let tmp_rpc_obj = this.rpcObj as any;
        let dirName = path.join(app.base, define.some_config.File_Dir.Servers);
        let exists = fs.existsSync(dirName);
        if (!exists) {
            return;
        }
        fs.readdirSync(dirName).forEach(function (serverName) {
            tmp_rpc_obj[serverName] = {};
            let remoteDirName = path.join(dirName, serverName, '/remote');

            let exists = fs.existsSync(remoteDirName);
            if (exists) {
                fs.readdirSync(remoteDirName).forEach(function (fileName) {
                    if (!/\.js$/.test(fileName)) {
                        return;
                    }
                    let fileBasename = path.basename(fileName, '.js');
                    let remote = require(path.join(remoteDirName, fileName));
                    if (remote.default && typeof remote.default === "function") {
                        tmp_rpc_obj[serverName][fileBasename] = self.initFunc(serverName, fileBasename,
                            remote.default.prototype, Object.getOwnPropertyNames(remote.default.prototype));
                        if (serverName === app.serverType) {
                            msgHandler[fileBasename] = new remote.default(app);
                        }
                    }
                });
            }
        });
    }

    rpcFunc(serverId: string) {
        this.toId = serverId;
        return this.rpcObj;
    }


    initFunc(serverName: string, filename: string, func: any, funcFields: string[]) {
        let res: { [method: string]: Function } = {};
        for (let field of funcFields) {
            if (field !== "constructor" && typeof func[field] === "function") {
                res[field] = this.proxyCb(serverName, filename + "." + field);
            }
        }
        return res;
    }

    proxyCb(serverName: string, file_method: string) {
        let self = this;
        let func = function (...args: any[]) {
            self.proxyCbSendToServer(self.toId, serverName, file_method, args);
            self.toId = null;
        }
        return func;
    }

    proxyCbSendToServer(sid: string, serverType: string, file_method: string, args: any[]) {
        if (sid === "*") {
            this.proxyCbSendToServerType(serverType, file_method, args);
            return;
        }

        let cb: Function = null as any;
        if (typeof args[args.length - 1] === "function") {
            cb = args.pop();
        }

        if (sid === app.serverId) {
            if (cb) {
                let timeout = {
                    "id": getRpcId(),
                    "cb": cb,
                    "timer": null as any
                }
                createRpcTimeout(timeout);
                args.push(getCallBackFuncSelf(timeout.id));
            }
            sendRpcMsgToSelf(file_method, args);
            return;
        }

        if (!app.rpcPool.hasSocket(sid)) {
            cb && cb(rpcErr.noServer);
            return;
        }

        let rpcInvoke: rpcMsg = {
            "route": file_method
        };
        if (cb) {
            let timeout = {
                "id": getRpcId(),
                "cb": cb,
                "timer": null as any
            }
            createRpcTimeout(timeout);
            rpcInvoke.id = timeout.id;
        }
        args.push(rpcInvoke)
        sendRpcMsg(sid, args);
    }

    proxyCbSendToServerType(serverType: string, file_method: string, args: any[]) {
        let cb: Function = null as any;
        if (typeof args[args.length - 1] === "function") {
            cb = args.pop();
        }
        let endTo: string[] = [];
        let servers = app.getServersByType(serverType);
        for (let i = 0; i < servers.length; i++) {
            endTo.push(servers[i].id);
        }

        if (endTo.length === 0) {
            cb && cb({});
            return;
        }

        let nums: number = endTo.length;
        let bindCb: Function = null as any;
        let msgObj = {} as any;
        if (cb) {
            bindCb = function (id: string) {
                return function (...msg: any[]) {
                    nums--;
                    msgObj[id] = msg;
                    if (nums === 0) {
                        cb(msgObj);
                    }
                };
            };
        }

        let tmpCb: Function = null as any;
        for (let i = 0; i < endTo.length; i++) {
            if (cb) {
                tmpCb = bindCb(endTo[i]);
            }
            send(endTo[i], tmpCb);
        }

        function send(toId: string, callback: Function) {
            if (toId === app.serverId) {
                let tmp_args = [...args];
                if (callback) {
                    let timeout = {
                        "id": getRpcId(),
                        "cb": callback,
                        "timer": null as any
                    }
                    createRpcTimeout(timeout);
                    tmp_args.push(getCallBackFuncSelf(timeout.id));
                }
                sendRpcMsgToSelf(file_method, tmp_args);
                return;
            }

            if (!app.rpcPool.hasSocket(toId)) {
                callback && callback(rpcErr.noServer);
                return;
            }
            let rpcInvoke: rpcMsg = {
                "route": file_method
            };
            if (callback) {
                let timeout = {
                    "id": getRpcId(),
                    "cb": callback,
                    "timer": null as any
                }
                createRpcTimeout(timeout);
                rpcInvoke.id = timeout.id;
            }
            sendRpcMsg(toId, [...args, rpcInvoke]);
        }
    }
}


/**
 * rpc超时计时器
 * @param timeout 
 */
function createRpcTimeout(timeout: rpcTimeout) {
    rpcRequest[timeout.id] = timeout;
    timeout.timer = setTimeout(function () {
        delRequest(timeout.id);
        timeout.cb(rpcErr.timeout);
    }, rpcTimeMax);
}

/**
 * 获取rpcId
 */
function getRpcId() {
    let id = rpcId++;
    if (rpcId > 999999) {
        rpcId = 1;
    }
    return id;
}


/**
 * 发送rpc消息
 */
function sendRpcMsg(sid: string, msg: any) {
    let msgBuf = Buffer.from(JSON.stringify(msg));
    let buf = Buffer.allocUnsafe(5 + msgBuf.length);
    buf.writeUInt32BE(1 + msgBuf.length, 0);
    buf.writeUInt8(define.Rpc_Msg.rpcMsg, 4);
    msgBuf.copy(buf, 5);
    app.rpcPool.sendMsg(sid, buf);
}

/**
 * 给本服务器发送rpc消息
 */
function sendRpcMsgToSelf(route: string, msg: any[]) {
    let cmd = route.split('.');
    let file = msgHandler[cmd[0]];
    file[cmd[1]].apply(file, msg);
}


/**
 * 删除rpc计时
 */
function delRequest(id: number) {
    delete rpcRequest[id];
}


/**
 * rpc回调
 */
function getCallBackFunc(sid: string, id: number) {
    return function (...args: any[]) {
        let rpcInvoke: rpcMsg = {
            "id": id
        };
        args.push(rpcInvoke);
        sendRpcMsg(sid, args);
    }
}

/**
 * rpc本服务器回调
 */
function getCallBackFuncSelf(id: number) {
    return function (...args: any[]) {
        let timeout = rpcRequest[id];
        if (timeout) {
            delRequest(id);
            clearTimeout(timeout.timer);
            timeout.cb.apply(null, args);
        }
    }
}

