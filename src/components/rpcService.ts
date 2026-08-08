/**
 * rpc connection management, sending rpc messages
 */


import * as fs from "fs";
import * as path from "path";
import Application from "../application";
import * as appUtil from "../util/appUtil";
import * as define from "../util/define";
import { I_rpcMsg, I_rpcTimeout, loggerLevel } from "../util/interfaceDefine";

let app: Application;
let userMsgHandler: { [filename: string]: any } = {};
let sysMsgHandler: { [filename: string]: any } = {};
let timeoutUtil: RpcTimeoutUtil = null as any;


const enum e_awaitRpcErrType {
    timeout = "rpcTimeout",
    error = "rpcError",
}

/**
 * init
 * @param _app 
 */
export function init(_app: Application) {
    app = _app;
    timeoutUtil = new RpcTimeoutUtil()
    new rpc_create();
}

export function rpcOnNewSocket(sid: string) {
    timeoutUtil.rpcOnNewSocket(sid);
}


/**
 * Process rpc messages
 * 
 *     [1]     [...]
 *   msgType   msgBuf
 */
export async function handleMsgAwait(sid: string, bufAll: Buffer) {
    const msgAll: { head: I_rpcMsg, data: any } = JSON.parse(bufAll.slice(1).toString());
    const rpcMsg: I_rpcMsg = msgAll.head;
    const msg = msgAll.data;

    if (!rpcMsg.cmd) {
        // 收到 rpc 回调
        const timeout = timeoutUtil.delRpcTimeout(rpcMsg.id as number);
        if (timeout) {
            if (rpcMsg.err) {
                timeout.rpcErr.setMsg(e_awaitRpcErrType.error);
                timeout.reject(timeout.rpcErr);
            } else {
                timeout.resolve(msg);
            }
        }
    } else {
        // 收到rpc调用
        let cmd = (rpcMsg.cmd as string).split('.');
        let data = null;
        let hasErr = false;
        try {
            const handlerObj = rpcMsg.isSys ? sysMsgHandler : userMsgHandler;
            data = await handlerObj[cmd[0]][cmd[1]](...msg);
        } catch (err: any) {
            hasErr = true;
            app.logger(loggerLevel.error, err);
        }
        if (!rpcMsg.id) {
            // notify 为 true 的通知类rpc， 不需要回调
            return;
        }
        if (data === undefined) {
            data = null;
        }
        let bufEnd = getRpcMsg({ "id": rpcMsg.id, "err": hasErr ? 1 : undefined }, data, define.Rpc_Msg.rpcMsgAwait);
        timeoutUtil.sendTo(sid, null, bufEnd);
    }
}

/**
 * rpc structure
 */
class rpc_create {
    private toId: string = "";
    private notify: boolean = false;
    private userRpcObj: Rpc = {};
    private sysRpcObj: MyDogSysRpc = {} as any;

    constructor() {
        this.loadRemoteMethod();
        this.loadSysRemoteMethod();
    }

    loadRemoteMethod() {
        let self = this;
        app.rpc = this.rpcFunc.bind(this);
        let tmp_rpc_obj = this.userRpcObj as any;
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
                            tmp_rpc_obj[serverName][fileBasename] = self.initFunc(0, serverName, fileBasename, remote.default.prototype, Object.getOwnPropertyNames(remote.default.prototype));
                        }
                        if (serverName === app.serverType) {
                            thisSvrHandler.push({ "filename": fileBasename, "con": remote.default });
                        }
                    }
                });
            }
        });
        for (let one of thisSvrHandler) {
            userMsgHandler[one.filename] = new one.con(app);
        }
    }

    loadSysRemoteMethod() {
        let self = this;
        app.sysRpc = this.sysRpcFunc.bind(this);
        let tmp_rpc_obj = this.sysRpcObj as any;
        let dirName = path.join(__dirname, "../sysRpc");
        let exists = fs.existsSync(dirName);
        if (!exists) {
            return;
        }
        let thisSvrHandler: { "filename": string, "con": any }[] = [];

        const meServerName = app.frontend ? "frontend" : "backend";
        fs.readdirSync(dirName).forEach(function (serverName) {
            let needRpc = true;
            let remoteDirName = path.join(dirName, serverName);
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
                            tmp_rpc_obj[serverName][fileBasename] = self.initFunc(1, serverName, fileBasename, remote.default.prototype, Object.getOwnPropertyNames(remote.default.prototype));
                        }
                        if (serverName === meServerName) {
                            thisSvrHandler.push({ "filename": fileBasename, "con": remote.default });
                        }
                    }
                });
            }
        });
        for (let one of thisSvrHandler) {
            sysMsgHandler[one.filename] = new one.con(app);
        }
    }

    rpcFunc(serverId: string, notify = false) {
        this.toId = serverId;
        this.notify = notify;
        return this.userRpcObj;
    }

    sysRpcFunc(serverId: string, notify = false) {
        this.toId = serverId;
        this.notify = notify;
        return this.sysRpcObj;
    }

    initFunc(isSys: number, serverType: string, filename: string, func: any, funcFields: string[]) {
        let res: { [method: string]: Function } = {};
        for (let field of funcFields) {
            if (field !== "constructor" && typeof func[field] === "function") {
                res[field] = this.proxyCb({ isSys, "serverType": serverType, "file_method": filename + "." + field });
            }
        }
        return res;
    }

    proxyCb(cmd: { "isSys": number, "serverType": string, "file_method": string }) {
        let self = this;
        let func = function (...args: any[]): Promise<any> | undefined {
            return self.send(self.toId, self.notify, cmd, args);
        }
        return func;
    }

    send(sid: string, notify: boolean, cmd: { "isSys": number, "serverType": string, "file_method": string }, args: any[]): Promise<any> | undefined {
        if (sid === "*") {
            if (cmd.isSys) {
                app.logger(loggerLevel.error, "mydogSysRpc cannot sendT");
                return;
            }
            this.sendT(cmd, args);
            return;
        }
        return this.sendAwait(sid, notify, cmd, args);
    }

    /** 发送给某一类型的服务器 */
    sendT(cmd: { "isSys": number, "serverType": string, "file_method": string }, args: any[]) {
        let servers = app.getServersByType(cmd.serverType);
        if (servers.length === 0) {
            return;
        }

        let bufEnd = getRpcMsg({ "cmd": cmd.file_method }, args, define.Rpc_Msg.rpcMsgAwait);
        for (let one of servers) {
            if (one.id === app.serverId) {
                timeoutUtil.sendRpcMsgToSelfAwait(cmd, args, true);
            } else {
                timeoutUtil.sendTo(one.id, null, bufEnd);
            }
        }
    }

    /** await 形式，发送给某一服务器 */
    sendAwait(sid: string, notify: boolean, cmd: { "isSys": number, "serverType": string, "file_method": string }, args: any[]): Promise<any> | undefined {
        if (sid === app.serverId) {
            return timeoutUtil.sendRpcMsgToSelfAwait(cmd, args, notify);
        }

        let rpcMsg: I_rpcMsg = {
            "cmd": cmd.file_method,
        };
        if (cmd.isSys) {
            rpcMsg.isSys = 1;
        }
        let promise: Promise<any> = undefined as any;
        let rpcTimeout: I_rpcTimeout = null as any;
        if (!notify) {
            let resolveFunc: Function = null as any;
            let rejectFunc: Function = null as any;
            promise = new Promise((resolve, reject) => {
                resolveFunc = resolve;
                rejectFunc = reject;
            });

            rpcTimeout = timeoutUtil.createRpcTimeout(resolveFunc, rejectFunc, new RpcError());
            rpcMsg.id = rpcTimeout.id;
        }
        const bufEnd = getRpcMsg(rpcMsg, args, define.Rpc_Msg.rpcMsgAwait);
        timeoutUtil.sendTo(sid, rpcTimeout, bufEnd);
        return promise;
    }



}

class RpcTimeoutUtil {
    private rpcId = 1;  // Must start from 1, not 0
    private rpcRequest = new Map<number, I_rpcTimeout>(); // id -> any
    private rpcRequestBySeconds = new Map<number, Set<number>>(); // seconds -> id 列表

    private rpcTimeMax: number = 10; //overtime time
    private outTime = 0;    // Current time + timeout   超时时间（时间戳 秒）

    private msgCacheCountMax = 50000; // 最大缓存消息个数
    private msgCacheSizeMax = 64 * 1024 * 1024; // 最大缓存消息字节数

    private nowCacheSize = 0;

    private msgCacheList: { "sid": string, "rpcTimeout": I_rpcTimeout | null, "buf": Buffer, "time": number }[] = []; // 缓存的消息列表

    constructor() {
        this.init();
    }

    private init() {
        let rpcConfig = app.someconfig.rpc || {};
        let rpcMsgCacheCount = Math.floor(rpcConfig.rpcMsgCacheCount);
        if (rpcMsgCacheCount >= 0) {
            this.msgCacheCountMax = rpcMsgCacheCount;
        }

        let rpcMsgCacheSize = Math.floor(rpcConfig.rpcMsgCacheSize);
        if (rpcMsgCacheSize >= 0) {
            this.msgCacheSizeMax = rpcMsgCacheSize;
        }

        let timeout = Math.floor(rpcConfig.timeout || 0) || 0;
        if (timeout >= 5) {
            this.rpcTimeMax = timeout;
        }



        this.tick();
    }

    private tick() {
        try {
            this.outTime = Math.floor(Date.now() / 1000 + this.rpcTimeMax);

            this.checkMsgCacheTimeout();
            this.checkRpcTimeout();
        } finally {
            setTimeout(() => {
                this.tick();
            }, 1000)
        }
    }


    private getRpcId() {
        let findCnt = 0;
        while (findCnt < 1000000) {
            this.rpcId++;
            if (this.rpcId > 999999999) {
                this.rpcId = 1;
            }
            if (!this.rpcRequest.has(this.rpcId)) {
                return this.rpcId;
            }
            findCnt++;
        }
        throw new Error("rpcId exhausted, too many in-flight requests");
    }

    createRpcTimeout(resolve: Function, reject: Function, rpcErr: RpcError) {
        const data: I_rpcTimeout = { "id": this.getRpcId(), resolve, reject, rpcErr, "time": this.outTime, };
        this.rpcRequest.set(data.id, data);

        let set = this.rpcRequestBySeconds.get(data.time);
        if (!set) {
            set = new Set();
            this.rpcRequestBySeconds.set(data.time, set);
        }
        set.add(data.id)

        return data;
    }

    delRpcTimeout(id: number): I_rpcTimeout {
        const data = this.rpcRequest.get(id);
        if (!data) {
            return null as any;
        }
        this.rpcRequest.delete(id);
        this.rpcRequestBySeconds.get(data.time)?.delete(data.id);

        return data;
    }

    /** 检测缓存的消息是否过多 */
    private checkMsgCacheCountSize() {
        if (this.msgCacheList.length <= this.msgCacheCountMax && this.nowCacheSize <= this.msgCacheSizeMax) {
            return;
        }

        let deleteCount = this.msgCacheList.length - this.msgCacheCountMax + 500;

        if (this.nowCacheSize > this.msgCacheSizeMax) {
            let tmpSize = this.nowCacheSize - this.msgCacheSizeMax + 1 * 1024 * 1024;
            let delCnt2 = 0;
            for (const one of this.msgCacheList) {
                delCnt2++;
                tmpSize -= one.buf.length;
                if (tmpSize <= 0) {
                    break;
                }
            }
            deleteCount = Math.max(deleteCount, delCnt2);
        }

        const delList = this.msgCacheList.splice(0, deleteCount);
        for (let one of delList) {
            this.nowCacheSize -= one.buf.length;

            if (one.rpcTimeout) {
                this.delRpcTimeout(one.rpcTimeout.id);
                this.timeoutCall(one.rpcTimeout);
            }
        }
    }

    /** 检测缓存的消息超时 */
    private checkMsgCacheTimeout() {
        const nowSeconds = Math.floor(Date.now() / 1000);

        let deleteCount = 0;
        let delSize = 0;
        for (let one of this.msgCacheList) {
            if (nowSeconds >= one.time) {
                deleteCount++;
                delSize += one.buf.length;
            } else {
                break;
            }
        }
        if (deleteCount > 0) {
            this.nowCacheSize -= delSize;

            const delList = this.msgCacheList.splice(0, deleteCount);
            for (let one of delList) {
                if (one.rpcTimeout) {
                    this.delRpcTimeout(one.rpcTimeout.id);
                    this.timeoutCall(one.rpcTimeout);
                }
            }
        }
    }

    /** 检测 rpc 超时 */
    private checkRpcTimeout() {
        let nowSeconds = Math.floor(Date.now() / 1000);

        for (const [seconds, set] of this.rpcRequestBySeconds) {
            if (nowSeconds < seconds) {
                continue;
            }
            this.rpcRequestBySeconds.delete(seconds);

            for (const id of set) {
                const one = this.rpcRequest.get(id);
                if (one) {
                    this.rpcRequest.delete(id);
                    this.timeoutCall(one);
                }
            }

        }
    }


    timeoutCall(one: I_rpcTimeout) {
        if (one) {
            one.rpcErr.setMsg(e_awaitRpcErrType.timeout);
            one.reject(one.rpcErr);
        }

    }


    sendTo(sid: string, rpcTimeout: I_rpcTimeout | null, buf: Buffer) {
        let socket = app.rpcPool.getSocket(sid);
        if (socket) {
            socket.send(buf);
            return;
        }
        // 注意：这里超时时间需要更短，以防连接后发送出去来不及等待返回。同时在检测超时的时候，需要早于 rpcRequestBySeconds 检测
        this.msgCacheList.push({ "sid": sid, "rpcTimeout": rpcTimeout, "buf": buf, "time": this.outTime - 3 });
        this.nowCacheSize += buf.length;
        this.checkMsgCacheCountSize();
    }



    rpcOnNewSocket(sid: string) {
        if (this.msgCacheList.length === 0) {
            return;
        }

        const sendList: typeof this.msgCacheList = [];
        let writeIdx = 0;

        for (let idx = 0; idx < this.msgCacheList.length; idx++) {
            const one = this.msgCacheList[idx];
            if (one.sid === sid) {
                sendList.push(one);
                this.nowCacheSize -= one.buf.length;
            } else {
                this.msgCacheList[writeIdx] = one;
                writeIdx++;
            }
        }

        if (sendList.length === 0) {
            return;
        }

        this.msgCacheList.length = writeIdx;  // 截断

        for (let one of sendList) {
            this.sendTo(sid, one.rpcTimeout, one.buf);
        }
    }


    /**
     * Send rpc message to this server await
     */
    sendRpcMsgToSelfAwait(cmd: { "isSys": number, "serverType": string, "file_method": string }, argsOrginal: any[], notify: boolean): Promise<any> | undefined {

        const handlerObj = cmd.isSys ? sysMsgHandler : userMsgHandler;
        let args = JSON.parse(JSON.stringify(argsOrginal));
        if (notify) {
            setImmediate(() => {
                let route = cmd.file_method.split('.');
                let file = handlerObj[route[0]];
                file[route[1]](...args);
            });
            return;
        }

        let resolveFunc: Function = null as any;
        let rejectFunc: Function = null as any;
        let promise = new Promise((resolve, reject) => {
            resolveFunc = resolve;
            rejectFunc = reject;
        });

        const timeoutInfo = this.createRpcTimeout(resolveFunc, rejectFunc, new RpcError());
        const rpcId = timeoutInfo.id;

        setImmediate(async () => {
            let route = cmd.file_method.split('.');
            let file = handlerObj[route[0]];
            let data: any = null;
            let hasErr = false;
            try {
                data = await file[route[1]](...args);
            } catch (err: any) {
                hasErr = true;
                app.logger(loggerLevel.error, err);
            }

            const timeout = this.delRpcTimeout(rpcId);
            if (!timeout) {
                return;
            }
            if (hasErr) {
                timeout.rpcErr.setMsg(e_awaitRpcErrType.error);
                timeout.reject(timeout.rpcErr);
            } else {
                if (data === undefined) {
                    data = null;
                }
                timeout.resolve(JSON.parse(JSON.stringify(data)));
            }
        });

        return promise;
    }
}



/**
 *  Send rpc message
 * 
 *    [4]       [1]        [...] 
 *  allMsgLen  msgType     msgBuf
 */
function getRpcMsg(head: I_rpcMsg, data: any, t: define.Rpc_Msg) {
    let msgBuf = Buffer.from(JSON.stringify({ head, data }));
    let buffEnd = Buffer.allocUnsafe(5 + msgBuf.length);
    buffEnd.writeUInt32BE(buffEnd.length - 4, 0);
    buffEnd.writeUInt8(t, 4);
    msgBuf.copy(buffEnd, 5);
    return buffEnd;
}





export class RpcError extends Error {
    name = "RpcError";
    constructor(message?: string) {
        super(message);
    }

    setMsg(message: string) {
        this.message = message;
    }
}
