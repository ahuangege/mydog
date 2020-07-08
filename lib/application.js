"use strict";
/**
 * app类
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
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
var appUtil = __importStar(require("./util/appUtil"));
var events_1 = require("events");
var rpcSocketPool_1 = require("./components/rpcSocketPool");
var Application = /** @class */ (function (_super) {
    __extends(Application, _super);
    function Application() {
        var _this = _super.call(this) || this;
        _this.appName = "myApp"; // 应用名称
        _this.hasStarted = false; // 是否已经启动
        _this.main = ""; // 启动文件
        _this.base = path.dirname(require.main.filename); // 根路径
        _this.routeConfig = []; // route.ts
        _this.masterConfig = {}; // master.ts
        _this.serversConfig = {}; // servers.ts
        _this.clientNum = 0; // 所有的socket连接数
        _this.clients = {}; // bind了的socket
        _this.settings = {}; // 用户set，get  
        _this.servers = {}; // 正在运行的所有用户服务器
        _this.serversIdMap = {}; // 正在运行的所有用户服务器（字典格式）
        _this.serverInfo = {}; // 本服务器的配置
        _this.isDaemon = false; // 是否后台运行
        _this.env = ""; // 环境
        _this.host = ""; // ip
        _this.port = 0; // port
        _this.clientPort = 0; // clientPort
        _this.serverId = ""; // 服务器名字id， 服务器唯一标识
        _this.serverType = ""; // 服务器类型
        _this.frontend = false; // 是否是前端服务器
        _this.startMode = "all"; // 启动方式  all / alone
        _this.startTime = 0; // 启动时刻
        _this.router = {}; // 路由消息到后端时的前置选择
        _this.rpc = null; // rpc包装
        _this.rpcPool = new rpcSocketPool_1.RpcSocketPool(); // rpc socket pool
        _this.logger = function () { }; // 内部日志输出口
        _this.msgEncode = null;
        _this.msgDecode = null;
        _this.protoEncode = null;
        _this.protoDecode = null;
        _this.someconfig = {}; // 部分开放的配置
        _this.frontendServer = null;
        _this.backendServer = null;
        _this.mydoglistFunc = null; // mydog list 监控获取数据
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
    Application.prototype.setConfig = function (key, value) {
        this.someconfig[key] = value;
    };
    /**
     * 设置键值对
     */
    Application.prototype.set = function (key, value) {
        this.settings[key] = value;
        return value;
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
        return this.servers[serverType] || [];
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
            client.close();
        }
    };
    /**
     * 配置部分session         》前端专用
     */
    Application.prototype.applySession = function (uid, some) {
        var client = this.clients[uid];
        if (client) {
            client.session.setSome(some);
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
        var msgBuf = this.protoEncode(cmdIndex, msg);
        var client;
        for (var i = 0; i < uids.length; i++) {
            client = this.clients[uids[i]];
            if (client) {
                client.send(msgBuf);
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
        var data = this.protoEncode(cmdIndex, msg);
        for (var uid in this.clients) {
            this.clients[uid].send(data);
        }
    };
    /**
     * 向客户端发送消息     》后端专用
     * @param cmd   路由
     * @param msg   消息
     * @param uidsid  uidsid 数组
     */
    Application.prototype.sendMsgByUidSid = function (cmd, msg, uidsid) {
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
        this.backendServer.sendMsgByUidSid(cmdIndex, msg, uidsid);
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
     * 获取bind的socket连接数
     */
    Application.prototype.getBindClientNum = function () {
        var num = 0;
        for (var x in this.clients) {
            num++;
        }
        return num;
    };
    /**
     * mydog list 监控时，获取用户自定义数据
     */
    Application.prototype.on_mydoglist = function (func) {
        this.mydoglistFunc = func;
    };
    return Application;
}(events_1.EventEmitter));
exports.default = Application;
