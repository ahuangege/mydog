/**
 * rpc connection management, sending rpc messages
 */


import Application from "../application";
import { I_rpcTimeout, I_rpcMsg, ServerInfo } from "../util/interfaceDefine";
import * as path from "path";
import * as fs from "fs";
import define = require("../util/define");
import * as appUtil from "../util/appUtil";

let app: Application;
let msgHandler: { [filename: string]: any } = {};
let rpcId = 1;  // Must start from 1, not 0
let rpcRequest: { [id: number]: I_rpcTimeout } = {};
let rpcTimeMax: number = 10 * 1000; //overtime time
let outTime = 0;    // Current time + timeout
let msgQueueDic: { [serverId: string]: { "rpcTimeout": I_rpcTimeout | null, "buf": Buffer, "time": number }[] } = {};
let msgCacheCount = 5000;

/**
 * init
 * @param _app 
 */
export function init(_app: Application) {
    app = _app;
    let rpcConfig = app.someconfig.rpc || {};
    let rpcMsgCacheCount = parseInt(rpcConfig.rpcMsgCacheCount as any);
    if (rpcMsgCacheCount >= 0) {
        msgCacheCount = rpcMsgCacheCount;
    }

    let timeout = Number(rpcConfig.timeout) || 0;
    if (timeout >= 5) {
        rpcTimeMax = timeout * 1000;
    }


    outTime = Date.now() + rpcTimeMax;
    setInterval(() => {
        outTime = Date.now() + rpcTimeMax;
    }, 100);
    setInterval(checkTimeout, 2000);

    new rpc_create();
}

export function rpcOnNewSocket(sid: string) {
    let queue = msgQueueDic[sid];
    if (!queue) {
        return;
    }
    delete msgQueueDic[sid];
    for (let one of queue) {
        sendTo(sid, one.rpcTimeout, one.buf);
    }
}


/**
 * Process rpc messages
 * 
 *     [1]         [1]      [...]    [...]
 *   msgType    rpcBufLen   rpcBuf   msgBuf
 */
export function handleMsg(sid: string, bufAll: Buffer) {
    let rpcBufLen = bufAll.readUInt8(1);
    let rpcMsg: I_rpcMsg = JSON.parse(bufAll.slice(2, 2 + rpcBufLen).toString());
    let msg: any[] = JSON.parse(bufAll.slice(2 + rpcBufLen).toString());

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

export async function handleMsgAwait(sid: string, bufAll: Buffer) {
    let rpcBufLen = bufAll.readUInt8(1);
    let rpcMsg: I_rpcMsg = JSON.parse(bufAll.slice(2, 2 + rpcBufLen).toString());
    let msg = JSON.parse(bufAll.slice(2 + rpcBufLen).toString());

    if (!rpcMsg.cmd) {
        let timeout = rpcRequest[rpcMsg.id as number];
        if (timeout) {
            delete rpcRequest[rpcMsg.id as number];
            timeout.cb(msg);
        }
    } else {
        let cmd = (rpcMsg.cmd as string).split('.');
        let data = await msgHandler[cmd[0]][cmd[1]](...msg);
        if (!rpcMsg.id) {
            return;
        }

        if (data === undefined) {
            data = null;
        }
        let bufEnd = getRpcMsg({ "id": rpcMsg.id }, Buffer.from(JSON.stringify(data)), define.Rpc_Msg.rpcMsgAwait);
        sendTo(sid, null, bufEnd);
    }
}

/**
 * rpc structure
 */
class rpc_create {
    private toId: string = "";
    private notify: boolean = false;
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

    rpcFunc(serverId: string, notify = false) {
        this.toId = serverId;
        this.notify = notify;
        return this.rpcObj;
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

    proxyCb(cmd: { "serverType": string, "file_method": string }) {
        let self = this;
        let func = function (...args: any[]): Promise<any> | undefined {
            return self.send(self.toId, self.notify, cmd, args);
        }
        return func;
    }

    send(sid: string, notify: boolean, cmd: { "serverType": string, "file_method": string }, args: any[]): Promise<any> | undefined {
        if (sid === "*") {
            this.sendT(cmd, args);
            return;
        }

        if (typeof args[args.length - 1] === "function") {
            this.sendCb(sid, cmd, args);
            return;
        }

        return this.sendAwait(sid, notify, cmd, args);
    }

    /** 发送给某一类型的服务器 */
    sendT(cmd: { "serverType": string, "file_method": string }, args: any[]) {
        let servers = app.getServersByType(cmd.serverType);
        if (servers.length === 0) {
            return;
        }

        let msgBuf = Buffer.from(JSON.stringify(args));
        let bufEnd = getRpcMsg({ "cmd": cmd.file_method }, msgBuf, define.Rpc_Msg.rpcMsg);
        for (let one of servers) {
            if (one.id === app.serverId) {
                sendRpcMsgToSelf(cmd, msgBuf);
            } else {
                sendTo(one.id, null, bufEnd);
            }
        }
    }

    /** 回调形式，发送给某一服务器 */
    sendCb(sid: string, cmd: { "serverType": string, "file_method": string }, args: any[]) {
        let cb: Function = args.pop();
        if (sid === app.serverId) {
            sendRpcMsgToSelf(cmd, Buffer.from(JSON.stringify(args)), cb);
            return;
        }

        let rpcTimeout: I_rpcTimeout = { "id": getRpcId(), "cb": cb, "time": outTime, "await": false };
        let rpcMsg: I_rpcMsg = {
            "cmd": cmd.file_method,
            "id": rpcTimeout.id
        };
        let bufEnd = getRpcMsg(rpcMsg, Buffer.from(JSON.stringify(args)), define.Rpc_Msg.rpcMsg);
        sendTo(sid, rpcTimeout, bufEnd);
    }

    /** await 形式，发送给某一服务器 */
    sendAwait(sid: string, notify: boolean, cmd: { "serverType": string, "file_method": string }, args: any[]): Promise<any> | undefined {
        if (sid === app.serverId) {
            return sendRpcMsgToSelfAwait(cmd, Buffer.from(JSON.stringify(args)), notify);
        }

        let rpcMsg: I_rpcMsg = {
            "cmd": cmd.file_method
        };

        let promise: Promise<any> = undefined as any;
        let rpcTimeout: I_rpcTimeout = null as any;
        if (!notify) {
            let cb: Function = null as any;
            promise = new Promise((resolve) => {
                cb = resolve;
            });
            rpcTimeout = { "id": getRpcId(), "cb": cb, "time": outTime, "await": true };
            rpcMsg.id = rpcTimeout.id;
        }
        let bufEnd = getRpcMsg(rpcMsg, Buffer.from(JSON.stringify(args)), define.Rpc_Msg.rpcMsgAwait);
        sendTo(sid, rpcTimeout, bufEnd);
        return promise;
    }

}


function sendTo(sid: string, rpcTimeout: I_rpcTimeout | null, buf: Buffer) {
    let socket = app.rpcPool.getSocket(sid);
    if (socket) {
        if (rpcTimeout) {
            rpcRequest[rpcTimeout.id] = rpcTimeout;
        }
        socket.send(buf);
        return;
    }
    let queue = msgQueueDic[sid];
    if (!queue) {
        queue = [];
        msgQueueDic[sid] = queue;
    }
    queue.push({ "rpcTimeout": rpcTimeout, "buf": buf, "time": outTime - 3000 });

    if (queue.length > msgCacheCount) {
        for (let one of queue.splice(0, 20)) {
            if (one.rpcTimeout) {
                timeoutCall(one.rpcTimeout);
            }
        }
    }
}


/**
 * Get rpcId
 */
function getRpcId() {
    let id = rpcId++;
    if (rpcId > 99999999) {
        rpcId = 1;
    }
    return id;
}

/**
 * rpc timeout detection
 */
function checkTimeout() {
    let now = Date.now();

    for (let sid in msgQueueDic) {
        let queue = msgQueueDic[sid];
        let deleteCount = 0;
        for (let one of queue) {
            if (one.time < now) {
                deleteCount++;
            } else {
                break;
            }
        }
        if (deleteCount > 0) {
            for (let one of queue.splice(0, deleteCount)) {
                if (one.rpcTimeout) {
                    timeoutCall(one.rpcTimeout);
                }
            }
        }
    }

    for (let id in rpcRequest) {
        if (rpcRequest[id].time < now) {
            let one = rpcRequest[id];
            delete rpcRequest[id];
            timeoutCall(one);
        }
    }
}

function timeoutCall(one: I_rpcTimeout) {
    process.nextTick(() => {
        one.await ? one.cb(undefined) : one.cb(true);
    });
}


/**
 *  Send rpc message
 * 
 *    [4]       [1]         [1]      [...]    [...] 
 *  allMsgLen  msgType   rpcBufLen   rpcBuf   msgBuf
 */
function getRpcMsg(rpcMsg: I_rpcMsg, msgBuf: Buffer, t: define.Rpc_Msg) {
    let rpcBuf = Buffer.from(JSON.stringify(rpcMsg));
    let buffEnd = Buffer.allocUnsafe(6 + rpcBuf.length + msgBuf.length);
    buffEnd.writeUInt32BE(buffEnd.length - 4, 0);
    buffEnd.writeUInt8(t, 4);
    buffEnd.writeUInt8(rpcBuf.length, 5);
    rpcBuf.copy(buffEnd, 6);
    msgBuf.copy(buffEnd, 6 + rpcBuf.length);
    return buffEnd;
}


/**
 * Send rpc message to this server
 */
function sendRpcMsgToSelf(cmd: { "serverType": string, "file_method": string }, msgBuf: Buffer, cb?: Function) {
    let args = JSON.parse(msgBuf.toString());
    if (cb) {
        let id = getRpcId();
        rpcRequest[id] = { "id": id, "cb": cb, "time": outTime, "await": false };
        args.push(getCallBackFuncSelf(id));
    }

    process.nextTick(() => {
        let route = cmd.file_method.split('.');
        let file = msgHandler[route[0]];
        file[route[1]](...args);
    });
}


/**
 * Send rpc message to this server await
 */
function sendRpcMsgToSelfAwait(cmd: { "serverType": string, "file_method": string }, msgBuf: Buffer, notify: boolean): Promise<any> | undefined {
    let args = JSON.parse(msgBuf.toString());
    if (notify) {
        process.nextTick(() => {
            let route = cmd.file_method.split('.');
            let file = msgHandler[route[0]];
            file[route[1]](...args);
        });
        return;
    }

    let cb: Function = null as any;
    let promise = new Promise((resolve) => {
        cb = resolve;
    });

    let id = getRpcId();
    rpcRequest[id] = { "id": id, "cb": cb, "time": outTime, "await": true };

    process.nextTick(async () => {
        let route = cmd.file_method.split('.');
        let file = msgHandler[route[0]];
        let data = await file[route[1]](...args);

        let timeout = rpcRequest[id];
        if (!timeout) {
            return;
        }
        delete rpcRequest[id];
        if (data === undefined) {
            data = null;
        }
        timeout.cb(JSON.parse(JSON.stringify(data)));
    });

    return promise;
}


/**
 * rpc callback
 */
function getCallBackFunc(sid: string, id: number) {
    return function (...args: any[]) {
        let bufEnd = getRpcMsg({ "id": id }, Buffer.from(JSON.stringify(args)), define.Rpc_Msg.rpcMsg);
        sendTo(sid, null, bufEnd);
    }
}

/**
 * rpc callback self server
 */
function getCallBackFuncSelf(id: number) {
    return function (...args: any[]) {
        args = JSON.parse(JSON.stringify(args));
        process.nextTick(() => {
            let timeout = rpcRequest[id];
            if (timeout) {
                delete rpcRequest[id];
                timeout.cb(...args);
            }
        });

    }
}

