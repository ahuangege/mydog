"use strict";
/**
 * rpc连接的管理，发送rpc消息
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleMsg = exports.init = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const define = require("../util/define");
const appUtil = __importStar(require("../util/appUtil"));
let app;
let msgHandler = {};
let rpcId = 1; // 必须从1开始，不可为0
let rpcRequest = {};
let rpcTimeMax = 10 * 1000; //超时时间
let outTime = 0; // 当前时刻 + 超时时间
/**
 * 初始化
 * @param _app
 */
function init(_app) {
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
exports.init = init;
/**
 * 处理rpc消息
 *
 *     [1]         [1]      [...]    [...]      [...]
 *   消息类型   rpcBufLen   rpcBuf   msgBuf   bufLast
 */
function handleMsg(sid, bufAll) {
    let rpcBufLen = bufAll.readUInt8(1);
    let rpcMsg = JSON.parse(bufAll.slice(2, 2 + rpcBufLen).toString());
    let msg;
    if (rpcMsg.len === undefined) {
        msg = JSON.parse(bufAll.slice(2 + rpcBufLen).toString());
    }
    else {
        msg = JSON.parse(bufAll.slice(2 + rpcBufLen, bufAll.length - rpcMsg.len).toString());
        msg.push(bufAll.slice(bufAll.length - rpcMsg.len));
    }
    if (!rpcMsg.cmd) {
        let timeout = rpcRequest[rpcMsg.id];
        if (timeout) {
            delete rpcRequest[rpcMsg.id];
            timeout.cb.apply(null, msg);
        }
    }
    else {
        let cmd = rpcMsg.cmd.split('.');
        if (rpcMsg.id) {
            msg.push(getCallBackFunc(sid, rpcMsg.id));
        }
        msgHandler[cmd[0]][cmd[1]](...msg);
    }
}
exports.handleMsg = handleMsg;
/**
 * rpc构造
 */
class rpc_create {
    constructor() {
        this.toId = "";
        this.rpcObj = {};
        this.loadRemoteMethod();
    }
    loadRemoteMethod() {
        let self = this;
        app.rpc = this.rpcFunc.bind(this);
        let tmp_rpc_obj = this.rpcObj;
        let dirName = path.join(app.base, define.some_config.File_Dir.Servers);
        let exists = fs.existsSync(dirName);
        if (!exists) {
            return;
        }
        let thisSvrHandler = [];
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
    rpcFunc(serverId) {
        this.toId = serverId;
        return this.rpcObj;
    }
    initFunc(serverType, filename, func, funcFields) {
        let res = {};
        for (let field of funcFields) {
            if (field !== "constructor" && typeof func[field] === "function") {
                res[field] = this.proxyCb({ "serverType": serverType, "file_method": filename + "." + field });
            }
        }
        return res;
    }
    proxyCb(cmd) {
        let self = this;
        let func = function (...args) {
            self.proxyCbSendToServer(self.toId, cmd, args);
        };
        return func;
    }
    proxyCbSendToServer(sid, cmd, args) {
        if (sid === "*") {
            this.proxyCbSendToServerType(cmd, args);
            return;
        }
        let cb = null;
        if (typeof args[args.length - 1] === "function") {
            cb = args.pop();
        }
        let bufLast = null;
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
                    cb(1 /* noServer */);
                });
            }
            return;
        }
        let rpcMsg = {
            "cmd": cmd.file_method
        };
        if (cb) {
            let id = getRpcId();
            rpcRequest[id] = { "cb": cb, "time": outTime };
            rpcMsg.id = id;
        }
        sendRpcMsg(socket, rpcMsg, Buffer.from(JSON.stringify(args)), bufLast);
    }
    proxyCbSendToServerType(cmd, args) {
        let cb = null;
        if (typeof args[args.length - 1] === "function") {
            cb = args.pop();
        }
        let bufLast = null;
        if (args[args.length - 1] instanceof Buffer) {
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
        let nums = servers.length;
        let msgObj = null;
        let bindCb = null;
        if (cb) {
            msgObj = {};
            bindCb = function (id) {
                return function (...msg) {
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
                send(one, bindCb(one.id));
            }
            else {
                send(one);
            }
        }
        function send(svr, callback) {
            if (svr.id === app.serverId) {
                sendRpcMsgToSelf(cmd, msgBuf, bufLast, callback);
                return;
            }
            let socket = app.rpcPool.getSocket(svr.id);
            if (!socket) {
                if (callback) {
                    process.nextTick(() => {
                        callback(1 /* noServer */);
                    });
                }
                return;
            }
            let rpcMsg = {
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
function timeoutCb(cb) {
    try {
        cb(2 /* timeout */);
    }
    catch (e) {
        app.logger("error" /* error */, e.stack);
    }
}
/**
 *  发送rpc消息
 *
 *    [4]       [1]         [1]      [...]    [...]      [...]
 *  allMsgLen  消息类型   rpcBufLen   rpcBuf   msgBuf   bufLast
 */
function sendRpcMsg(socket, rpcMsg, msgBuf, bufLast) {
    let buffLastLen = 0;
    if (bufLast) {
        buffLastLen = bufLast.length;
        rpcMsg.len = buffLastLen;
    }
    let rpcBuf = Buffer.from(JSON.stringify(rpcMsg));
    let buffEnd = Buffer.allocUnsafe(6 + rpcBuf.length + msgBuf.length + buffLastLen);
    buffEnd.writeUInt32BE(buffEnd.length - 4, 0);
    buffEnd.writeUInt8(6 /* rpcMsg */, 4);
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
function sendRpcMsgToSelf(cmd, msgBuf, bufLast, cb) {
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
function getCallBackFunc(sid, id) {
    return function (...args) {
        let bufLast = null;
        if (args[args.length - 1] instanceof Buffer) {
            bufLast = args.pop();
        }
        let socket = app.rpcPool.getSocket(sid);
        if (socket) {
            sendRpcMsg(socket, { "id": id }, Buffer.from(JSON.stringify(args)), bufLast);
        }
    };
}
/**
 * rpc本服务器回调
 */
function getCallBackFuncSelf(id) {
    return function (...args) {
        let buf = null;
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
    };
}
