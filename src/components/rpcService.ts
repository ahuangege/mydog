/**
 * rpc connection management, sending rpc messages
 */


import Application from "../application";
import { I_rpcTimeout, I_rpcMsg, ServerInfo, rpcErr } from "../util/interfaceDefine";
import * as path from "path";
import * as fs from "fs";
import define = require("../util/define");
import * as appUtil from "../util/appUtil";
import { I_RpcSocket } from "./rpcSocketPool";

let app: Application;
let msgHandler: { [filename: string]: any } = {};
let rpcId = 1;  // Must start from 1, not 0
let rpcRequest: { [id: number]: I_rpcTimeout } = {};
let rpcTimeMax: number = 10 * 1000; //overtime time
let outTime = 0;    // Current time + timeout


/**
 * init
 * @param _app 
 */
export function init(_app: Application) {
    app = _app;
    let rpcConfig = app.someconfig.rpc || {};
    let timeout = Number(rpcConfig.timeout) || 0;
    if (timeout >= 5) {
        rpcTimeMax = timeout * 1000;
    }

    outTime = Date.now() + rpcTimeMax;
    setInterval(() => {
        outTime = Date.now() + rpcTimeMax;
    }, 100);
    setInterval(checkTimeout, 3000);

    new rpc_create();
}


/**
 * Process rpc messages
 * 
 *     [1]         [1]      [...]    [...]      [...]
 *   msgType    rpcBufLen   rpcBuf   msgBuf    bufLast
 */
export function handleMsg(sid: string, bufAll: Buffer) {
    let rpcBufLen = bufAll.readUInt8(1);
    let rpcMsg: I_rpcMsg = JSON.parse(bufAll.slice(2, 2 + rpcBufLen).toString());
    let msg: any[];
    if (rpcMsg.len === undefined) {
        msg = JSON.parse(bufAll.slice(2 + rpcBufLen).toString());
    } else {
        msg = JSON.parse(bufAll.slice(2 + rpcBufLen, bufAll.length - rpcMsg.len).toString());
        msg.push(bufAll.slice(bufAll.length - rpcMsg.len));
    }

    if (!rpcMsg.cmd) {
        let timeout = rpcRequest[rpcMsg.id as number];
        if (timeout) {
            delete rpcRequest[rpcMsg.id as number];
            timeout.cb(...msg);
        }
    } else {
        let cmd = (rpcMsg.cmd as string).split('.');
        if (rpcMsg.id) {
            msg.push(getCallBackFunc(sid, rpcMsg.id));
        }
        msgHandler[cmd[0]][cmd[1]](...msg);
    }
}

export function handleMsgAwait(sid: string, bufAll: Buffer) {
    let rpcBufLen = bufAll.readUInt8(1);
    let rpcMsg: I_rpcMsg = JSON.parse(bufAll.slice(2, 2 + rpcBufLen).toString());
    let msg: any;
    if (rpcMsg.len === undefined) {
        msg = JSON.parse(bufAll.slice(2 + rpcBufLen).toString());
    } else if (2 + rpcBufLen + rpcMsg.len === bufAll.length) {
        msg = bufAll.slice(bufAll.length - rpcMsg.len);
    } else {
        msg = JSON.parse(bufAll.slice(2 + rpcBufLen, bufAll.length - rpcMsg.len).toString());
        msg.push(bufAll.slice(bufAll.length - rpcMsg.len));
    }

    if (!rpcMsg.cmd) {
        let timeout = rpcRequest[rpcMsg.id as number];
        if (timeout) {
            delete rpcRequest[rpcMsg.id as number];
            timeout.cb(msg);
        }
    } else {
        let cmd = (rpcMsg.cmd as string).split('.');
        let res = msgHandler[cmd[0]][cmd[1]](...msg);
        if (!rpcMsg.id) {
            return;
        }
        if (res && typeof res.then === "function") {
            res.then((data: any) => {
                cbFunc(data);
            });
        } else {
            cbFunc(res);
        }

        function cbFunc(data: any) {
            let socket = app.rpcPool.getSocket(sid);
            if (!socket) {
                return;
            }
            if (data === undefined) {
                data = null;
            }
            if (data instanceof Buffer) {
                socket.send(getRpcMsg({ "id": rpcMsg.id }, Buffer.allocUnsafe(0), data, define.Rpc_Msg.rpcMsgAwait));
            } else if (data instanceof Array && data[data.length - 1] instanceof Buffer) {
                let tmpRes = [...data];
                let buf: Buffer = tmpRes.pop();
                socket.send(getRpcMsg({ "id": rpcMsg.id }, Buffer.from(JSON.stringify(tmpRes)), buf, define.Rpc_Msg.rpcMsgAwait));
            } else {
                socket.send(getRpcMsg({ "id": rpcMsg.id }, Buffer.from(JSON.stringify(data)), null as any, define.Rpc_Msg.rpcMsgAwait));
            }
        }

    }
}

/**
 * rpc structure
 */
class rpc_create {
    private toId: string = "";
    private notify: boolean = false;

    private rpcObj: Rpc = {};
    private rpcObjAwait: Rpc = {};

    constructor() {
        this.loadRemoteMethod();
    }

    loadRemoteMethod() {
        let self = this;
        app.rpc = this.rpcFunc.bind(this);
        app.rpcAwait = this.rpcFuncAwait.bind(this);
        let tmp_rpc_obj = this.rpcObj as any;
        let tmp_rpc_obj_await = this.rpcObjAwait as any;
        let dirName = path.join(app.base, define.some_config.File_Dir.Servers);
        let exists = fs.existsSync(dirName);
        if (!exists) {
            return;
        }
        let thisSvrHandler: { "filename": string, "con": any }[] = [];
        fs.readdirSync(dirName).forEach(function (serverName) {
            let needRpc = !app.noRpcMatrix[appUtil.getNoRpcKey(app.serverType, serverName)];
            if (!needRpc && serverName !== app.serverType) {
                return;
            }
            let remoteDirName = path.join(dirName, serverName, '/remote');
            let exists = fs.existsSync(remoteDirName);
            if (exists) {
                if (needRpc) {
                    tmp_rpc_obj[serverName] = {};
                    tmp_rpc_obj_await[serverName] = {};
                }
                fs.readdirSync(remoteDirName).forEach(function (fileName) {
                    if (!fileName.endsWith(".js")) {
                        return;
                    }
                    let fileBasename = path.basename(fileName, '.js');
                    let remote = require(path.join(remoteDirName, fileName));
                    if (remote.default && typeof remote.default === "function") {
                        if (needRpc) {
                            tmp_rpc_obj[serverName][fileBasename] = self.initFunc(serverName, fileBasename, remote.default.prototype, Object.getOwnPropertyNames(remote.default.prototype));
                            tmp_rpc_obj_await[serverName][fileBasename] = self.initFuncAwait(serverName, fileBasename, remote.default.prototype, Object.getOwnPropertyNames(remote.default.prototype));
                        }
                        if (serverName === app.serverType) {
                            thisSvrHandler.push({ "filename": fileBasename, "con": remote.default });
                        }
                    }
                });
            }
        });
        for (let one of thisSvrHandler) {
            msgHandler[one.filename] = new one.con(app);
        }
    }

    rpcFunc(serverId: string) {
        this.toId = serverId;
        return this.rpcObj;
    }
    rpcFuncAwait(serverId: string, notify = false) {
        this.toId = serverId;
        this.notify = notify;
        return this.rpcObjAwait;
    }

    initFunc(serverType: string, filename: string, func: any, funcFields: string[]) {
        let res: { [method: string]: Function } = {};
        for (let field of funcFields) {
            if (field !== "constructor" && typeof func[field] === "function") {
                res[field] = this.proxyCb({ "serverType": serverType, "file_method": filename + "." + field });
            }
        }
        return res;
    }
    initFuncAwait(serverType: string, filename: string, func: any, funcFields: string[]) {
        let res: { [method: string]: Function } = {};
        for (let field of funcFields) {
            if (field !== "constructor" && typeof func[field] === "function") {
                res[field] = this.proxyCbAwait({ "serverType": serverType, "file_method": filename + "." + field });
            }
        }
        return res;
    }

    proxyCb(cmd: { "serverType": string, "file_method": string }) {
        let self = this;
        let func = function (...args: any[]) {
            self.send(self.toId, cmd, args);
        }
        return func;
    }

    proxyCbAwait(cmd: { "serverType": string, "file_method": string }) {
        let self = this;
        let func = function (...args: any[]): Promise<any> | null {
            return self.sendAwait(self.toId, self.notify, cmd, args);
        }
        return func;
    }



    send(sid: string, cmd: { "serverType": string, "file_method": string }, args: any[]) {
        if (sid === "*") {
            this.sendT(cmd, args);
            return;
        }

        let cb: Function = null as any;
        if (typeof args[args.length - 1] === "function") {
            cb = args.pop();
        }
        let bufLast: Buffer = null as any;
        if (args[args.length - 1] instanceof Buffer) {
            bufLast = args.pop();
        }

        if (sid === app.serverId) {
            sendRpcMsgToSelf(cmd, Buffer.from(JSON.stringify(args)), bufLast, cb);
            return;
        }

        let socket = app.rpcPool.getSocket(sid);
        if (!socket) {
            if (cb) {
                process.nextTick(() => {
                    cb(rpcErr.noServer);
                });
            }
            return;
        }

        let rpcMsg: I_rpcMsg = {
            "cmd": cmd.file_method
        };
        if (cb) {
            let id = getRpcId();
            rpcRequest[id] = { "cb": cb, "time": outTime, "await": false };
            rpcMsg.id = id;
        }
        socket.send(getRpcMsg(rpcMsg, Buffer.from(JSON.stringify(args)), bufLast, define.Rpc_Msg.rpcMsg));
    }

    sendT(cmd: { "serverType": string, "file_method": string }, args: any[]) {
        let servers = app.getServersByType(cmd.serverType);
        if (servers.length === 0) {
            return;
        }

        let bufLast: Buffer = null as any;
        if (args[args.length - 1] instanceof Buffer) {
            bufLast = args.pop();
        }

        let msgBuf = Buffer.from(JSON.stringify(args));
        let bufEnd = getRpcMsg({ "cmd": cmd.file_method }, msgBuf, bufLast, define.Rpc_Msg.rpcMsg);
        for (let one of servers) {
            if (one.id === app.serverId) {
                sendRpcMsgToSelf(cmd, msgBuf, bufLast);
            } else {
                let socket = app.rpcPool.getSocket(one.id);
                socket && socket.send(bufEnd);
            }
        }
    }


    sendAwait(sid: string, notify: boolean, cmd: { "serverType": string, "file_method": string }, args: any[]): Promise<any> | null {
        if (sid === "*") {
            this.sendTAwait(cmd, args);
            return null;
        }

        let bufLast: Buffer = null as any;
        if (args[args.length - 1] instanceof Buffer) {
            bufLast = args.pop();
        }
        if (sid === app.serverId) {
            return sendRpcMsgToSelfAwait(cmd, Buffer.from(JSON.stringify(args)), bufLast, notify);
        }

        let socket = app.rpcPool.getSocket(sid);
        if (!socket) {
            return null;
        }

        let rpcMsg: I_rpcMsg = {
            "cmd": cmd.file_method
        };

        let promise: Promise<any> = null as any;
        if (!notify) {
            let cb: Function = null as any;
            promise = new Promise((resolve) => {
                cb = resolve;
            });
            let id = getRpcId();
            rpcRequest[id] = { "cb": cb, "time": outTime, "await": true };
            rpcMsg.id = id;
        }
        socket.send(getRpcMsg(rpcMsg, Buffer.from(JSON.stringify(args)), bufLast, define.Rpc_Msg.rpcMsgAwait));
        return promise;
    }

    sendTAwait(cmd: { "serverType": string, "file_method": string }, args: any[]) {
        let servers = app.getServersByType(cmd.serverType);
        if (servers.length === 0) {
            return;
        }

        let bufLast: Buffer = null as any;
        if (args[args.length - 1] instanceof Buffer) {
            bufLast = args.pop();
        }

        let msgBuf = Buffer.from(JSON.stringify(args));
        let bufEnd = getRpcMsg({ "cmd": cmd.file_method }, msgBuf, bufLast, define.Rpc_Msg.rpcMsgAwait);
        for (let one of servers) {
            if (one.id === app.serverId) {
                sendRpcMsgToSelfAwait(cmd, msgBuf, bufLast, true);
            } else {
                let socket = app.rpcPool.getSocket(one.id);
                socket && socket.send(bufEnd);
            }
        }
    }

}



/**
 * Get rpcId
 */
function getRpcId() {
    let id = rpcId++;
    if (rpcId > 9999999) {
        rpcId = 1;
    }
    return id;
}

/**
 * rpc timeout detection
 */
function checkTimeout() {
    let now = Date.now();
    for (let id in rpcRequest) {
        if (rpcRequest[id].time < now) {
            let one = rpcRequest[id];
            delete rpcRequest[id];
            one.await ? one.cb(null) : one.cb(rpcErr.timeout);
        }
    }
}


/**
 *  Send rpc message
 * 
 *    [4]       [1]         [1]      [...]    [...]      [...]
 *  allMsgLen  msgType   rpcBufLen   rpcBuf   msgBuf    bufLast
 */
function getRpcMsg(rpcMsg: I_rpcMsg, msgBuf: Buffer, bufLast: Buffer, t: define.Rpc_Msg) {
    let buffLastLen = 0;
    if (bufLast) {
        buffLastLen = bufLast.length;
        rpcMsg.len = buffLastLen;
    }
    let rpcBuf = Buffer.from(JSON.stringify(rpcMsg));
    let buffEnd = Buffer.allocUnsafe(6 + rpcBuf.length + msgBuf.length + buffLastLen);
    buffEnd.writeUInt32BE(buffEnd.length - 4, 0);
    buffEnd.writeUInt8(t, 4);
    buffEnd.writeUInt8(rpcBuf.length, 5);
    rpcBuf.copy(buffEnd, 6);
    msgBuf.copy(buffEnd, 6 + rpcBuf.length);
    if (bufLast) {
        bufLast.copy(buffEnd, buffEnd.length - buffLastLen);
    }
    return buffEnd;
}


/**
 * Send rpc message to this server
 */
function sendRpcMsgToSelf(cmd: { "serverType": string, "file_method": string }, msgBuf: Buffer, bufLast: Buffer, cb?: Function) {
    let args = JSON.parse(msgBuf.toString());
    if (bufLast) {
        args.push(bufLast);
    }
    if (cb) {
        let id = getRpcId();
        rpcRequest[id] = { "cb": cb, "time": outTime, "await": false };
        args.push(getCallBackFuncSelf(id));
    }

    process.nextTick(() => {
        let route = cmd.file_method.split('.');
        let file = msgHandler[route[0]];
        file[route[1]].apply(file, args);
    });
}


/**
 * Send rpc message to this server await
 */
function sendRpcMsgToSelfAwait(cmd: { "serverType": string, "file_method": string }, msgBuf: Buffer, bufLast: Buffer, notify: boolean): Promise<any> | null {
    let args = JSON.parse(msgBuf.toString());
    if (bufLast) {
        args.push(bufLast);
    }
    if (notify) {
        process.nextTick(() => {
            let route = cmd.file_method.split('.');
            let file = msgHandler[route[0]];
            file[route[1]].apply(file, args);
        });
        return null;
    }

    let cb: Function = null as any;
    let promise = new Promise((resolve) => {
        cb = resolve;
    });

    let id = getRpcId();
    rpcRequest[id] = { "cb": cb, "time": outTime, "await": true };

    process.nextTick(() => {
        let route = cmd.file_method.split('.');
        let file = msgHandler[route[0]];
        let res = file[route[1]].apply(file, args);
        if (res && typeof res.then === "function") {
            res.then((data: any) => {
                cbFunc(data);
            });
        } else {
            cbFunc(res);
        }
        function cbFunc(data: any) {
            let timeout = rpcRequest[id];
            if (!timeout) {
                return;
            }
            delete rpcRequest[id];
            if (data === undefined) {
                data = null;
            }
            if (data instanceof Buffer) {
                timeout.cb(data);
            } else if (data instanceof Array && data[data.length - 1] instanceof Buffer) {
                let tmpRes = [...data];
                let buf: Buffer = tmpRes.pop();
                tmpRes = JSON.parse(JSON.stringify(tmpRes));
                tmpRes.push(buf);
                timeout.cb(tmpRes);
            } else {
                timeout.cb(JSON.parse(JSON.stringify(data)));
            }
        }
    });

    return promise;
}


/**
 * rpc callback
 */
function getCallBackFunc(sid: string, id: number) {
    return function (...args: any[]) {
        let bufLast: Buffer = null as any;
        if (args[args.length - 1] instanceof Buffer) {
            bufLast = args.pop();
        }
        let socket = app.rpcPool.getSocket(sid);
        if (socket) {
            socket.send(getRpcMsg({ "id": id }, Buffer.from(JSON.stringify(args)), bufLast, define.Rpc_Msg.rpcMsg));
        }
    }
}

/**
 * rpc server callback
 */
function getCallBackFuncSelf(id: number) {
    return function (...args: any[]) {
        let buf: Buffer = null as any;
        if (args[args.length - 1] instanceof Buffer) {
            buf = args.pop();
        }
        args = JSON.parse(JSON.stringify(args));
        if (buf) {
            args.push(buf);
        }

        process.nextTick(() => {
            let timeout = rpcRequest[id];
            if (timeout) {
                delete rpcRequest[id];
                timeout.cb.apply(null, args);
            }
        });

    }
}

