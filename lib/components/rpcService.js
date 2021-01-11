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
 */
function handleMsg(id, msg) {
    let data = JSON.parse(msg.slice(1).toString());
    let rpcInvoke = data.pop();
    if (!rpcInvoke.route) {
        let timeout = rpcRequest[rpcInvoke.id];
        if (timeout) {
            delete rpcRequest[rpcInvoke.id];
            timeout.cb.apply(null, data);
        }
    }
    else {
        let cmd = rpcInvoke.route.split('.');
        if (rpcInvoke.id) {
            data.push(getCallBackFunc(id, rpcInvoke.id));
        }
        let file = msgHandler[cmd[0]];
        file[cmd[1]].apply(file, data);
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
            if (app.serverTypeSocketOffConfig[appUtil.getServerTypeSocketOffKey(app.serverType, serverName)]) {
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
                        tmp_rpc_obj[serverName][fileBasename] = self.initFunc(serverName, fileBasename, remote.default.prototype, Object.getOwnPropertyNames(remote.default.prototype));
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
        if (sid === app.serverId) {
            args = JSON.parse(JSON.stringify(args));
            if (cb) {
                let id = getRpcId();
                rpcRequest[id] = { "cb": cb, "time": outTime };
                args.push(getCallBackFuncSelf(id));
            }
            sendRpcMsgToSelf(cmd.file_method, args);
            return;
        }
        if (!app.rpcPool.hasSocket(sid)) {
            if (cb) {
                process.nextTick(() => {
                    cb(1 /* noServer */);
                });
            }
            return;
        }
        let rpcInvoke = {
            "route": cmd.file_method
        };
        if (cb) {
            let id = getRpcId();
            rpcRequest[id] = { "cb": cb, "time": outTime };
            rpcInvoke.id = id;
        }
        args.push(rpcInvoke);
        sendRpcMsg(sid, args);
    }
    proxyCbSendToServerType(cmd, args) {
        let cb = null;
        if (typeof args[args.length - 1] === "function") {
            cb = args.pop();
        }
        let endTo = [];
        let servers = app.getServersByType(cmd.serverType);
        for (let one of servers) {
            endTo.push(one.id);
        }
        if (endTo.length === 0) {
            if (cb) {
                process.nextTick(() => {
                    cb({});
                });
            }
            return;
        }
        let nums = endTo.length;
        let bindCb = null;
        let msgObj = null;
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
        let tmpCb = null;
        for (let i = 0; i < endTo.length; i++) {
            if (cb) {
                tmpCb = bindCb(endTo[i]);
            }
            send(endTo[i], tmpCb);
        }
        function send(toId, callback) {
            if (toId === app.serverId) {
                let tmp_args = JSON.parse(JSON.stringify(args));
                if (callback) {
                    let id = getRpcId();
                    rpcRequest[id] = { "cb": callback, "time": outTime };
                    tmp_args.push(getCallBackFuncSelf(id));
                }
                sendRpcMsgToSelf(cmd.file_method, tmp_args);
                return;
            }
            if (!app.rpcPool.hasSocket(toId)) {
                if (callback) {
                    process.nextTick(() => {
                        callback(1 /* noServer */);
                    });
                }
                return;
            }
            let rpcInvoke = {
                "route": cmd.file_method
            };
            if (callback) {
                let id = getRpcId();
                rpcRequest[id] = { "cb": callback, "time": outTime };
                rpcInvoke.id = id;
            }
            args.push(rpcInvoke);
            sendRpcMsg(toId, args);
            args.pop();
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
 * 发送rpc消息
 */
function sendRpcMsg(sid, msg) {
    let msgBuf = Buffer.from(JSON.stringify(msg));
    let buf = Buffer.allocUnsafe(5 + msgBuf.length);
    buf.writeUInt32BE(1 + msgBuf.length, 0);
    buf.writeUInt8(6 /* rpcMsg */, 4);
    msgBuf.copy(buf, 5);
    app.rpcPool.sendMsg(sid, buf);
}
/**
 * 给本服务器发送rpc消息
 */
function sendRpcMsgToSelf(route, msg) {
    process.nextTick(() => {
        let cmd = route.split('.');
        let file = msgHandler[cmd[0]];
        file[cmd[1]].apply(file, msg);
    });
}
/**
 * rpc回调
 */
function getCallBackFunc(sid, id) {
    return function (...args) {
        let rpcInvoke = {
            "id": id
        };
        args.push(rpcInvoke);
        sendRpcMsg(sid, args);
    };
}
/**
 * rpc本服务器回调
 */
function getCallBackFuncSelf(id) {
    return function (...args) {
        args = JSON.parse(JSON.stringify(args));
        process.nextTick(() => {
            let timeout = rpcRequest[id];
            if (timeout) {
                delete rpcRequest[id];
                timeout.cb.apply(null, args);
            }
        });
    };
}
