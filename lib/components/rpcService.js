"use strict";
/**
 * rpc连接的管理，发送rpc消息
 */
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
var path = __importStar(require("path"));
var fs = __importStar(require("fs"));
var define = require("../util/define");
var app;
var msgHandler = {};
var rpcId = 1; // 必须从1开始，不可为0
var rpcRequest = {};
var rpcTimeMax = 10 * 1000;
/**
 * 初始化
 * @param _app
 */
function init(_app) {
    app = _app;
    if (app.rpcConfig.hasOwnProperty("timeout") && Number(app.rpcConfig["timeout"]) > 5) {
        rpcTimeMax = Number(app.rpcConfig["timeout"]) * 1000;
    }
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
            delRequest(rpcInvoke.id);
            clearTimeout(timeout.timer);
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
                            msgHandler[fileBasename] = new remote.default(app);
                        }
                    }
                });
            }
        });
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
            if (cb) {
                var timeout = {
                    "id": getRpcId(),
                    "cb": cb,
                    "timer": null
                };
                createRpcTimeout(timeout);
                args.push(getCallBackFuncSelf(timeout.id));
            }
            sendRpcMsgToSelf(file_method, args);
            return;
        }
        if (!app.rpcPool.hasSocket(sid)) {
            cb && cb(1 /* noServer */);
            return;
        }
        var rpcInvoke = {
            "route": file_method
        };
        if (cb) {
            var timeout = {
                "id": getRpcId(),
                "cb": cb,
                "timer": null
            };
            createRpcTimeout(timeout);
            rpcInvoke.id = timeout.id;
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
        for (var i = 0; i < servers.length; i++) {
            endTo.push(servers[i].id);
        }
        if (endTo.length === 0) {
            cb && cb({});
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
                var tmp_args = args.slice();
                if (callback) {
                    var timeout = {
                        "id": getRpcId(),
                        "cb": callback,
                        "timer": null
                    };
                    createRpcTimeout(timeout);
                    tmp_args.push(getCallBackFuncSelf(timeout.id));
                }
                sendRpcMsgToSelf(file_method, tmp_args);
                return;
            }
            if (!app.rpcPool.hasSocket(toId)) {
                callback && callback(1 /* noServer */);
                return;
            }
            var rpcInvoke = {
                "route": file_method
            };
            if (callback) {
                var timeout = {
                    "id": getRpcId(),
                    "cb": callback,
                    "timer": null
                };
                createRpcTimeout(timeout);
                rpcInvoke.id = timeout.id;
            }
            sendRpcMsg(toId, args.concat([rpcInvoke]));
        }
    };
    return rpc_create;
}());
/**
 * rpc超时计时器
 * @param timeout
 */
function createRpcTimeout(timeout) {
    rpcRequest[timeout.id] = timeout;
    timeout.timer = setTimeout(function () {
        delRequest(timeout.id);
        timeout.cb(2 /* timeout */);
    }, rpcTimeMax);
}
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
    var cmd = route.split('.');
    var file = msgHandler[cmd[0]];
    file[cmd[1]].apply(file, msg);
}
/**
 * 删除rpc计时
 */
function delRequest(id) {
    delete rpcRequest[id];
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
            delRequest(id);
            clearTimeout(timeout.timer);
            timeout.cb.apply(null, args);
        }
    };
}
