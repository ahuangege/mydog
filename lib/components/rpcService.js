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
var path = __importStar(require("path"));
var fs = __importStar(require("fs"));
var define = require("../util/define");
var app;
var msgHandler = {};
var rpcId = 1; // 必须从1开始，不可为0
var rpcRequest = {};
var rpcTimeMax = 10 * 1000; //超时时间
var outTime = 0; // 当前时刻 + 超时时间
/**
 * 初始化
 * @param _app
 */
function init(_app) {
    app = _app;
    var rpcConfig = app.someconfig.rpc || {};
    var timeout = Number(rpcConfig.timeout) || 0;
    if (timeout >= 5) {
        rpcTimeMax = timeout * 1000;
    }
    outTime = Date.now() + rpcTimeMax;
    setInterval(function () {
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
    var data = JSON.parse(msg.slice(1).toString());
    var rpcInvoke = data.pop();
    if (!rpcInvoke.route) {
        var timeout = rpcRequest[rpcInvoke.id];
        if (timeout) {
            delete rpcRequest[rpcInvoke.id];
            timeout.cb.apply(null, data);
        }
    }
    else {
        var cmd = rpcInvoke.route.split('.');
        if (rpcInvoke.id) {
            data.push(getCallBackFunc(id, rpcInvoke.id));
        }
        var file = msgHandler[cmd[0]];
        file[cmd[1]].apply(file, data);
    }
}
exports.handleMsg = handleMsg;
/**
 * rpc构造
 */
var rpc_create = /** @class */ (function () {
    function rpc_create() {
        this.toId = null;
        this.rpcObj = {};
        this.loadRemoteMethod();
    }
    rpc_create.prototype.loadRemoteMethod = function () {
        var self = this;
        app.rpc = this.rpcFunc.bind(this);
        var tmp_rpc_obj = this.rpcObj;
        var dirName = path.join(app.base, define.some_config.File_Dir.Servers);
        var exists = fs.existsSync(dirName);
        if (!exists) {
            return;
        }
        var thisSvrHandler = [];
        fs.readdirSync(dirName).forEach(function (serverName) {
            tmp_rpc_obj[serverName] = {};
            var remoteDirName = path.join(dirName, serverName, '/remote');
            var exists = fs.existsSync(remoteDirName);
            if (exists) {
                fs.readdirSync(remoteDirName).forEach(function (fileName) {
                    if (!/\.js$/.test(fileName)) {
                        return;
                    }
                    var fileBasename = path.basename(fileName, '.js');
                    var remote = require(path.join(remoteDirName, fileName));
                    if (remote.default && typeof remote.default === "function") {
                        tmp_rpc_obj[serverName][fileBasename] = self.initFunc(serverName, fileBasename, remote.default.prototype, Object.getOwnPropertyNames(remote.default.prototype));
                        if (serverName === app.serverType) {
                            thisSvrHandler.push({ "filename": fileBasename, "con": remote.default });
                        }
                    }
                });
            }
        });
        for (var _i = 0, thisSvrHandler_1 = thisSvrHandler; _i < thisSvrHandler_1.length; _i++) {
            var one = thisSvrHandler_1[_i];
            msgHandler[one.filename] = new one.con(app);
        }
    };
    rpc_create.prototype.rpcFunc = function (serverId) {
        this.toId = serverId;
        return this.rpcObj;
    };
    rpc_create.prototype.initFunc = function (serverName, filename, func, funcFields) {
        var res = {};
        for (var _i = 0, funcFields_1 = funcFields; _i < funcFields_1.length; _i++) {
            var field = funcFields_1[_i];
            if (field !== "constructor" && typeof func[field] === "function") {
                res[field] = this.proxyCb(serverName, filename + "." + field);
            }
        }
        return res;
    };
    rpc_create.prototype.proxyCb = function (serverName, file_method) {
        var self = this;
        var func = function () {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i] = arguments[_i];
            }
            self.proxyCbSendToServer(self.toId, serverName, file_method, args);
            self.toId = null;
        };
        return func;
    };
    rpc_create.prototype.proxyCbSendToServer = function (sid, serverType, file_method, args) {
        if (sid === "*") {
            this.proxyCbSendToServerType(serverType, file_method, args);
            return;
        }
        var cb = null;
        if (typeof args[args.length - 1] === "function") {
            cb = args.pop();
        }
        if (sid === app.serverId) {
            args = JSON.parse(JSON.stringify(args));
            if (cb) {
                var id = getRpcId();
                rpcRequest[id] = { "cb": cb, "time": outTime };
                args.push(getCallBackFuncSelf(id));
            }
            sendRpcMsgToSelf(file_method, args);
            return;
        }
        if (!app.rpcPool.hasSocket(sid)) {
            if (cb) {
                process.nextTick(function () {
                    cb(1 /* noServer */);
                });
            }
            return;
        }
        var rpcInvoke = {
            "route": file_method
        };
        if (cb) {
            var id = getRpcId();
            rpcRequest[id] = { "cb": cb, "time": outTime };
            rpcInvoke.id = id;
        }
        args.push(rpcInvoke);
        sendRpcMsg(sid, args);
    };
    rpc_create.prototype.proxyCbSendToServerType = function (serverType, file_method, args) {
        var cb = null;
        if (typeof args[args.length - 1] === "function") {
            cb = args.pop();
        }
        var endTo = [];
        var servers = app.getServersByType(serverType);
        for (var _i = 0, servers_1 = servers; _i < servers_1.length; _i++) {
            var one = servers_1[_i];
            endTo.push(one.id);
        }
        if (endTo.length === 0) {
            if (cb) {
                process.nextTick(function () {
                    cb({});
                });
            }
            return;
        }
        var nums = endTo.length;
        var bindCb = null;
        var msgObj = {};
        if (cb) {
            bindCb = function (id) {
                return function () {
                    var msg = [];
                    for (var _i = 0; _i < arguments.length; _i++) {
                        msg[_i] = arguments[_i];
                    }
                    nums--;
                    msgObj[id] = msg;
                    if (nums === 0) {
                        cb(msgObj);
                    }
                };
            };
        }
        var tmpCb = null;
        for (var i = 0; i < endTo.length; i++) {
            if (cb) {
                tmpCb = bindCb(endTo[i]);
            }
            send(endTo[i], tmpCb);
        }
        function send(toId, callback) {
            if (toId === app.serverId) {
                var tmp_args = JSON.parse(JSON.stringify(args));
                if (callback) {
                    var id = getRpcId();
                    rpcRequest[id] = { "cb": callback, "time": outTime };
                    tmp_args.push(getCallBackFuncSelf(id));
                }
                sendRpcMsgToSelf(file_method, tmp_args);
                return;
            }
            if (!app.rpcPool.hasSocket(toId)) {
                if (callback) {
                    process.nextTick(function () {
                        callback(1 /* noServer */);
                    });
                }
                return;
            }
            var rpcInvoke = {
                "route": file_method
            };
            if (callback) {
                var id = getRpcId();
                rpcRequest[id] = { "cb": callback, "time": outTime };
                rpcInvoke.id = id;
            }
            args.push(rpcInvoke);
            sendRpcMsg(toId, args);
            args.pop();
        }
    };
    return rpc_create;
}());
/**
 * 获取rpcId
 */
function getRpcId() {
    var id = rpcId++;
    if (rpcId > 999999) {
        rpcId = 1;
    }
    return id;
}
/**
 * rpc超时检测
 */
function checkTimeout() {
    var now = Date.now();
    for (var id in rpcRequest) {
        if (rpcRequest[id].time < now) {
            var cb = rpcRequest[id].cb;
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
        app.logger("warn" /* warn */, e.stack);
    }
}
/**
 * 发送rpc消息
 */
function sendRpcMsg(sid, msg) {
    var msgBuf = Buffer.from(JSON.stringify(msg));
    var buf = Buffer.allocUnsafe(5 + msgBuf.length);
    buf.writeUInt32BE(1 + msgBuf.length, 0);
    buf.writeUInt8(6 /* rpcMsg */, 4);
    msgBuf.copy(buf, 5);
    app.rpcPool.sendMsg(sid, buf);
}
/**
 * 给本服务器发送rpc消息
 */
function sendRpcMsgToSelf(route, msg) {
    process.nextTick(function () {
        var cmd = route.split('.');
        var file = msgHandler[cmd[0]];
        file[cmd[1]].apply(file, msg);
    });
}
/**
 * rpc回调
 */
function getCallBackFunc(sid, id) {
    return function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        var rpcInvoke = {
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
    return function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        var timeout = rpcRequest[id];
        if (timeout) {
            delete rpcRequest[id];
            timeout.cb.apply(null, args);
        }
    };
}
