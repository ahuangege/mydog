"use strict";
/**
 * app类
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
var path = __importStar(require("path"));
var define_1 = require("./util/define");
var remoteBackend = __importStar(require("./components/remoteBackend"));
var msgCoder_1 = require("./components/msgCoder");
var appUtil = __importStar(require("./util/appUtil"));
var events_1 = require("events");
var Application = /** @class */ (function (_super) {
    __extends(Application, _super);
    function Application() {
        var _this = _super.call(this) || this;
        _this.hasStarted = false; // 是否已经启动
        _this.main = ""; // 启动文件
        _this.base = path.dirname(require.main.filename); // 根路径
        _this.routeConfig = []; // route.ts
        _this.masterConfig = {}; // master.ts
        _this.rpcServersConfig = []; // rpc.ts
        _this.serversConfig = {}; // servers.ts
        _this.clientNum = 0; // 所有的socket连接数
        _this.clients = {}; // bind了的socket
        _this.settings = {}; // 用户set，get  
        _this.servers = {}; // 正在运行的所有用户服务器
        _this.serversIdMap = {}; // 正在运行的所有用户服务器（字典格式）
        _this.rpcServersIdMap = {}; // 正在运行的所有rpc服务器（字典格式）
        _this.serverToken = define_1.some_config.Server_Token; // 服务器内部认证密钥
        _this.clientToken = define_1.some_config.Master_Client_Token; // master与cli的认证密匙
        _this.serverInfo = {}; // 本服务器的配置
        _this.env = "development"; // 环境
        _this.host = ""; // ip
        _this.port = 0; // port
        _this.serverId = ""; // 服务器名字id， 服务器唯一标识
        _this.serverType = ""; // 服务器类型
        _this.frontend = false; // 是否是前端服务器
        _this.alone = false; // 是否是单独的
        _this.startMode = "all"; // 启动方式  all / alone
        _this.startTime = 0; // 启动时刻
        _this.router = {}; // 路由消息到后端时的前置选择
        _this.rpcRouter = {}; // rpc消息时的前置选择
        _this.rpc = {}; // rpc包装
        _this.logger = function () { }; // 内部日志输出口
        _this.encodeDecodeConfig = {}; // 编码解码函数
        _this.connectorConfig = {}; // 前端server配置
        _this.rpcConfig = {}; // rpc配置
        appUtil.defaultConfiguration(_this);
        return _this;
    }
    /**
     * 启动
     */
    Application.prototype.start = function () {
        if (this.hasStarted) {
            console.error("the app has already started");
            return;
        }
        this.hasStarted = true;
        this.startTime = new Date().getTime();
        appUtil.startServer(this);
    };
    /**
     * 配置编码解码函数
     * @param config
     */
    Application.prototype.set_encodeDecodeConfig = function (config) {
        this.encodeDecodeConfig = config;
    };
    /**
     * 配置前端server参数
     * @param config
     */
    Application.prototype.set_connectorConfig = function (config) {
        this.connectorConfig = config;
    };
    /**
     * 配置rpc参数
     * @param config
     */
    Application.prototype.set_rpcConfig = function (config) {
        this.rpcConfig = config;
    };
    /**
     * 设置键值对
     */
    Application.prototype.set = function (key, value) {
        this.settings[key] = value;
    };
    /**
     * 获取键key对应的值
     */
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
        remoteBackend.sendMsgByUidSid(cmdIndex, msg, uids, sids);
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
}(events_1.EventEmitter));
exports.default = Application;
