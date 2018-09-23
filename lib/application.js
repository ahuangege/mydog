"use strict";
/**
 * app类
 */
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var path = __importStar(require("path"));
var define_1 = __importDefault(require("./util/define"));
var RemoteFrontend = __importStar(require("./components/remoteFrontend"));
var RemoteBackend = __importStar(require("./components/remoteBackend"));
var RpcService = __importStar(require("./components/rpcService"));
var msgCoder_1 = require("./components/msgCoder");
var appUtil = __importStar(require("./util/appUtil"));
var hasStarted = false; // 是否已经启动
var Application = /** @class */ (function () {
    function Application() {
        this.main = ""; // 启动文件
        this.base = path.dirname(require.main.filename); // 根路径
        this.routeConfig = []; // route.json
        this.masterConfig = {}; // master.json
        this.rpcServersConfig = []; // rpc.json
        this.serversConfig = {}; // servers.json
        this.clientNum = 0; // 所有的socket连接数
        this.clients = {}; // bind了的socket
        this.settings = {}; // 用户set，get  
        this.servers = {}; // 正在运行的所有用户服务器
        this.serversIdMap = {}; // 正在运行的所有用户服务器（字典格式）
        this.rpcServersIdMap = {}; // 正在运行的所有rpc服务器（字典格式）
        this.serverToken = define_1.default.Server_Token; // 服务器内部认证密钥
        this.clientToken = define_1.default.Master_Client_Token; // master与cli的认证密匙
        this.serverInfo = {}; // 本服务器的配置
        this.env = "development"; // 环境
        this.host = ""; // ip
        this.port = 0; // port
        this.serverId = ""; // 服务器名字id， 服务器唯一标识
        this.serverType = ""; // 服务器类型
        this.frontend = false; // 是否是前端服务器
        this.alone = false; // 是否是单独的
        this.startMode = "all"; // 启动方式  all / alone
        this.startTime = 0; // 启动时刻
        this.router = {}; // 路由消息到后端时的前置选择
        this.rpcRouter = {}; // rpc消息时的前置选择
        this.rpc = {}; // rpc包装
        this.rpcService = RpcService; // 用户服务器，rpc调用管理
        this.remoteBackend = RemoteBackend; // 后端服务器，用来管理前端连接
        this.remoteFrontend = RemoteFrontend; // 前端服务器，用来管理连接后端
        this.logger = function () { }; // 内部日志输出口
        appUtil.defaultConfiguration(this);
    }
    /**
     * 启动
     */
    Application.prototype.start = function () {
        if (hasStarted) {
            console.error("the app has already started");
            return;
        }
        hasStarted = true;
        this.startTime = new Date().getTime();
        appUtil.startServer(this);
    };
    /**
     * 设置键值对
     */
    Application.prototype.set = function (key, value) {
        this.settings[key] = value;
    };
    Application.prototype.get = function (key) {
        return this.settings[key];
    };
    /**
     * 删除某一个键值对
     */
    Application.prototype.delete = function (key) {
        delete this.settings[key];
    };
    /**
     * 根据服务器类型获取服务器数组
     */
    Application.prototype.getServersByType = function (serverType) {
        return this.servers[serverType];
    };
    /**
     * 获取某一个服务器配置
     */
    Application.prototype.getServerById = function (serverId) {
        return this.serversIdMap[serverId];
    };
    /**
     * 路由配置 (决定前端调用哪个后端)      》前端专用
     * @param serverType 后端服务器类型
     * @param routeFunc 配置函数
     */
    Application.prototype.route = function (serverType, routeFunc) {
        if (typeof routeFunc !== "function") {
            console.error("app.route() --- cb must be a function");
            return;
        }
        this.router[serverType] = routeFunc;
    };
    /**
     * rpc路由配置
     * @param serverType 接收消息的服务器类型
     * @param routeFunc 配置函数
     */
    Application.prototype.rpcRoute = function (serverType, rpcRouteFunc) {
        if (typeof rpcRouteFunc !== "function") {
            console.error("app.rpcRoute() --- cb must be a function");
            return;
        }
        this.rpcRouter[serverType] = rpcRouteFunc;
    };
    /**
     * 是否有绑定的客户端     》前端专用
     */
    Application.prototype.hasClient = function (uid) {
        return !!this.clients[uid];
    };
    /**
     * 关闭绑定的客户端       》前端专用
     */
    Application.prototype.closeClient = function (uid) {
        var client = this.clients[uid];
        if (client) {
            client.socket.close();
        }
    };
    /**
     * 配置部分session         》前端专用
     */
    Application.prototype.applySession = function (uid, some) {
        var client = this.clients[uid];
        if (client) {
            client.setSome(some);
        }
    };
    /**
     * 向客户端发送消息            》前端专用
     * @param cmd   路由
     * @param msg   消息
     * @param uids  uid数组 [1,2]
     */
    Application.prototype.sendMsgByUid = function (cmd, msg, uids) {
        if (!this.frontend) {
            console.error("app.sendMsgByUid() --- backend server cannot use this method");
            return;
        }
        var cmdIndex = this.routeConfig.indexOf(cmd);
        if (cmdIndex === -1) {
            console.error("app.sendMsgByUid() --- no such route : " + cmd);
            return;
        }
        if (msg === undefined) {
            msg = null;
        }
        var msgBuf = msgCoder_1.encodeClientData(cmdIndex, msg);
        var client;
        for (var i = 0; i < uids.length; i++) {
            client = this.clients[uids[i]];
            if (client) {
                client.socket.send(msgBuf);
            }
        }
    };
    /**
     * 向所有客户端发送消息      》前端专用
     * @param cmd 路由
     * @param msg 消息
     */
    Application.prototype.sendAll = function (cmd, msg) {
        if (!this.frontend) {
            console.error("app.sendAll() --- backend server cannot use this method");
            return;
        }
        var cmdIndex = this.routeConfig.indexOf(cmd);
        if (cmdIndex === -1) {
            console.error("app.sendAll() --- no such route : " + cmd);
            return;
        }
        if (msg === undefined) {
            msg = null;
        }
        var data = msgCoder_1.encodeClientData(cmdIndex, msg);
        for (var uid in this.clients) {
            this.clients[uid].socket.send(data);
        }
    };
    /**
     * 向客户端发送消息     》后端专用
     * @param cmd   路由
     * @param msg   消息
     * @param uids  uid数组 [1,2]
     * @param sids  sid数组 ["connector-server-1", "connector-server-2"]
     */
    Application.prototype.sendMsgByUidSid = function (cmd, msg, uids, sids) {
        if (this.frontend) {
            console.error("app.sendMsgByUidSid() --- frontend server cannot use this method");
            return;
        }
        var cmdIndex = this.routeConfig.indexOf(cmd);
        if (cmdIndex === -1) {
            console.error("app.sendMsgByUidSid() --- no such route : " + cmd);
            return;
        }
        if (msg === undefined) {
            msg = null;
        }
        this.remoteBackend.sendMsgByUidSid(cmdIndex, msg, uids, sids);
    };
    /**
     * 配置服务器执行函数
     * @param type  服务器类型  "all"或者"gate|connector"形式
     * @param cb    执行函数
     */
    Application.prototype.configure = function (type, cb) {
        if (type === "all") {
            cb.call(this);
            return;
        }
        var ts = type.split("|");
        for (var i = 0; i < ts.length; i++) {
            if (this.serverType === ts[i].trim()) {
                cb.call(this);
                break;
            }
        }
    };
    /**
     * 设置内部日志输出
     * @param cb  回调函数
     */
    Application.prototype.onLog = function (cb) {
        if (typeof cb !== "function") {
            console.error("app.onLog() --- cb must be a function");
            return;
        }
        this.logger = cb;
    };
    /**
     * 加载模块
     * @param dir  相对根目录的路径
     * @returns
     */
    Application.prototype.loadFile = function (dir) {
        dir = path.join(this.base, dir);
        return require(dir);
    };
    /**
     * 获取bind的socket连接数
     */
    Application.prototype.getBindClientNum = function () {
        return Object.keys(this.clients).length;
    };
    return Application;
}());
exports.default = Application;
