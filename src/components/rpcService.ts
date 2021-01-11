/**
 * rpc连接的管理，发送rpc消息
 */


import Application from "../application";
import { I_rpcTimeout, I_rpcMsg, loggerType } from "../util/interfaceDefine";
import * as path from "path";
import * as fs from "fs";
import define = require("../util/define");
import * as appUtil from "../util/appUtil";
import { rpcErr, ServerInfo } from "../..";
import { I_RpcSocket } from "./rpcSocketPool";

let app: Application;
let msgHandler: { [filename: string]: any } = {};
let rpcId = 1;  // 必须从1开始，不可为0
let rpcRequest: { [id: number]: I_rpcTimeout } = {};
let rpcTimeMax: number = 10 * 1000; //超时时间
let outTime = 0;    // 当前时刻 + 超时时间



/**
 * 初始化
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
 * 处理rpc消息
 * 
 *     [1]         [1]      [...]    [...]      [...]
 *   消息类型   rpcBufLen   rpcBuf   msgBuf   bufLast
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
            timeout.cb.apply(null, msg);
        }
    } else {
        let cmd = (rpcMsg.cmd as string).split('.');
        if (rpcMsg.id) {
            msg.push(getCallBackFunc(sid, rpcMsg.id));
        }
        msgHandler[cmd[0]][cmd[1]](...msg);
    }
}


/**
 * rpc构造
 */
class rpc_create {
    private toId: string = "";
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
            if (app.noRpcMatrix[appUtil.getNoRpcKey(app.serverType, serverName)]) {
                return;
            }
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
        let func = function (...args: any[]) {
            self.proxyCbSendToServer(self.toId, cmd, args);
        }
        return func;
    }

    proxyCbSendToServer(sid: string, cmd: { "serverType": string, "file_method": string }, args: any[]) {
        if (sid === "*") {
            this.proxyCbSendToServerType(cmd, args);
            return;
        }

        let cb: Function = null as any;
        if (typeof args[args.length - 1] === "function") {
            cb = args.pop();
        }
        let bufLast: Buffer = null as any;
        if (args[args.length - 1] instanceof Uint8Array) {
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
            rpcRequest[id] = { "cb": cb, "time": outTime };
            rpcMsg.id = id;
        }
        sendRpcMsg(socket, rpcMsg, Buffer.from(JSON.stringify(args)), bufLast);
    }

    proxyCbSendToServerType(cmd: { "serverType": string, "file_method": string }, args: any[]) {
        let cb: Function = null as any;
        if (typeof args[args.length - 1] === "function") {
            cb = args.pop();
        }
        let bufLast: Buffer = null as any;
        if (args[args.length - 1] instanceof Uint8Array) {
            bufLast = args.pop();
        }

        let servers = app.getServersByType(cmd.serverType);
        if (servers.length === 0) {
            if (cb) {
                process.nextTick(() => {
                    cb({});
                });
            }
            return;
        }

        let nums: number = servers.length;
        let msgObj: any = null as any;
        let bindCb: Function = null as any;
        if (cb) {
            msgObj = {};
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

        let msgBuf = Buffer.from(JSON.stringify(args));
        for (let one of servers) {
            if (cb) {
                send(one, bindCb(one.id))
            } else {
                send(one);
            }
        }

        function send(svr: ServerInfo, callback?: Function) {
            if (svr.id === app.serverId) {
                sendRpcMsgToSelf(cmd, msgBuf, bufLast, callback);
                return;
            }

            let socket = app.rpcPool.getSocket(svr.id);
            if (!socket) {
                if (callback) {
                    process.nextTick(() => {
                        callback(rpcErr.noServer);
                    });
                }
                return;
            }
            let rpcMsg: I_rpcMsg = {
                "cmd": cmd.file_method
            };
            if (callback) {
                let id = getRpcId();
                rpcRequest[id] = { "cb": callback, "time": outTime };
                rpcMsg.id = id;
            }
            sendRpcMsg(socket, rpcMsg, msgBuf, bufLast);
        }
    }
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
 * rpc超时检测
 */
function checkTimeout() {
    let now = Date.now();
    for (let id in rpcRequest) {
        if (rpcRequest[id].time < now) {
            let cb = rpcRequest[id].cb;
            delete rpcRequest[id];
            timeoutCb(cb);
        }
    }
}

function timeoutCb(cb: Function) {
    try {
        cb(rpcErr.timeout);
    } catch (e) {
        app.logger(loggerType.error, e.stack);
    }
}


/**
 *  发送rpc消息
 * 
 *    [4]       [1]         [1]      [...]    [...]      [...]
 *  allMsgLen  消息类型   rpcBufLen   rpcBuf   msgBuf   bufLast
 */
function sendRpcMsg(socket: I_RpcSocket, rpcMsg: I_rpcMsg, msgBuf: Buffer, bufLast: Buffer) {
    let buffLastLen = 0;
    if (bufLast) {
        buffLastLen = bufLast.length;
        rpcMsg.len = buffLastLen;
    }
    let rpcBuf = Buffer.from(JSON.stringify(rpcMsg));
    let buffEnd = Buffer.allocUnsafe(6 + rpcBuf.length + msgBuf.length + buffLastLen);
    buffEnd.writeUInt32BE(buffEnd.length - 4, 0);
    buffEnd.writeUInt8(define.Rpc_Msg.rpcMsg, 4);
    buffEnd.writeUInt8(rpcBuf.length, 5);
    rpcBuf.copy(buffEnd, 6);
    msgBuf.copy(buffEnd, 6 + rpcBuf.length);
    if (bufLast) {
        bufLast.copy(buffEnd, buffEnd.length - buffLastLen);
    }
    socket.send(buffEnd);
}

/**
 * 给本服务器发送rpc消息
 */
function sendRpcMsgToSelf(cmd: { "serverType": string, "file_method": string }, msgBuf: Buffer, bufLast: Buffer, cb?: Function) {
    let args = JSON.parse(msgBuf.toString());
    if (bufLast) {
        args.push(bufLast);
    }
    if (cb) {
        let id = getRpcId();
        rpcRequest[id] = { "cb": cb, "time": outTime };
        args.push(getCallBackFuncSelf(id));
    }

    process.nextTick(() => {
        let route = cmd.file_method.split('.');
        let file = msgHandler[route[0]];
        file[route[1]].apply(file, args);
    });
}



/**
 * rpc回调
 */
function getCallBackFunc(sid: string, id: number) {
    return function (...args: any[]) {
        let bufLast: Buffer = null as any;
        if (args[args.length - 1] instanceof Uint8Array) {
            bufLast = args.pop();
        }
        let socket = app.rpcPool.getSocket(sid);
        if (socket) {
            sendRpcMsg(socket, { "id": id }, Buffer.from(JSON.stringify(args)), bufLast);
        }
    }
}

/**
 * rpc本服务器回调
 */
function getCallBackFuncSelf(id: number) {
    return function (...args: any[]) {
        let buf: Buffer = null as any;
        if (args[args.length - 1] instanceof Uint8Array) {
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

