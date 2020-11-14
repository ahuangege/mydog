"use strict";
/**
 * app类
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
const path = __importStar(require("path"));
const appUtil = __importStar(require("./util/appUtil"));
const events_1 = require("events");
const rpcSocketPool_1 = require("./components/rpcSocketPool");
class Application extends events_1.EventEmitter {
    constructor() {
        super();
        this.appName = "hello world"; // 应用名称
        this.hasStarted = false; // 是否已经启动
        this.main = ""; // 启动文件
        this.base = path.dirname(require.main.filename); // 根路径
        this.routeConfig = []; // route.ts
        this.masterConfig = {}; // master.ts
        this.serversConfig = {}; // servers.ts
        this.clientNum = 0; // 所有的socket连接数
        this.clients = {}; // bind了的socket
        this.settings = {}; // 用户set，get  
        this.servers = {}; // 正在运行的所有用户服务器
        this.serversIdMap = {}; // 正在运行的所有用户服务器（字典格式）
        this.serverInfo = {}; // 本服务器的配置
        this.isDaemon = false; // 是否后台运行
        this.env = ""; // 环境
        this.serverId = ""; // 服务器名字id， 服务器唯一标识
        this.serverType = ""; // 服务器类型
        this.frontend = false; // 是否是前端服务器
        this.startMode = "all"; // 启动方式  all / alone
        this.startTime = 0; // 启动时刻
        this.router = {}; // 路由消息到后端时的前置选择
        this.rpc = null; // rpc包装
        this.rpcPool = new rpcSocketPool_1.RpcSocketPool(); // rpc socket pool
        this.logger = function () { }; // 内部日志输出口
        this.msgEncode = null;
        this.msgDecode = null;
        this.protoEncode = null;
        this.protoDecode = null;
        this.someconfig = {}; // 部分开放的配置
        this.frontendServer = null;
        this.backendServer = null;
        appUtil.defaultConfiguration(this);
    }
    /**
     * 启动
     */
    start() {
        if (this.hasStarted) {
            console.error("the app has already started");
            return;
        }
        this.hasStarted = true;
        this.startTime = new Date().getTime();
        appUtil.startServer(this);
    }
    setConfig(key, value) {
        this.someconfig[key] = value;
        if (key === "logger") {
            this.logger = value;
        }
    }
    /**
     * 设置键值对
     */
    set(key, value) {
        this.settings[key] = value;
        return value;
    }
    /**
     * 获取键key对应的值
     */
    get(key) {
        return this.settings[key];
    }
    /**
     * 删除某一个键值对
     */
    delete(key) {
        delete this.settings[key];
    }
    /**
     * 根据服务器类型获取服务器数组
     */
    getServersByType(serverType) {
        return this.servers[serverType] || [];
    }
    /**
     * 获取某一个服务器配置
     */
    getServerById(serverId) {
        return this.serversIdMap[serverId];
    }
    /**
     * 路由配置 (决定前端调用哪个后端)
     * @param serverType 后端服务器类型
     * @param routeFunc 配置函数
     */
    route(serverType, routeFunc) {
        this.router[serverType] = routeFunc;
    }
    /**
     * 是否有绑定的客户端
     */
    hasClient(uid) {
        return !!this.clients[uid];
    }
    /**
     * 关闭绑定的客户端
     */
    closeClient(uid) {
        let client = this.clients[uid];
        if (client) {
            client.close();
        }
    }
    /**
     * 配置部分session
     */
    applySession(uid, some) {
        let client = this.clients[uid];
        if (client) {
            client.session.set(some);
        }
    }
    /**
     * 向客户端发送消息
     * @param cmd   路由
     * @param msg   消息
     * @param uids  uid数组 [1,2]
     */
    sendMsgByUid(cmd, msg, uids) {
        if (msg === undefined) {
            msg = null;
        }
        let msgBuf = this.protoEncode(cmd, msg);
        let client;
        let i;
        for (i = 0; i < uids.length; i++) {
            client = this.clients[uids[i]];
            if (client) {
                client.send(msgBuf);
            }
        }
    }
    /**
     * 向所有客户端发送消息
     * @param cmd 路由
     * @param msg 消息
     */
    sendAll(cmd, msg) {
        if (msg === undefined) {
            msg = null;
        }
        let data = this.protoEncode(cmd, msg);
        let uid;
        for (uid in this.clients) {
            this.clients[uid].send(data);
        }
    }
    /**
     * 向客户端发送消息
     * @param cmd   路由
     * @param msg   消息
     * @param uidsid  uidsid 数组
     */
    sendMsgByUidSid(cmd, msg, uidsid) {
        if (msg === undefined) {
            msg = null;
        }
        this.backendServer.sendMsgByUidSid(cmd, msg, uidsid);
    }
    /**
     * 向客户端发送消息
     * @param cmd   路由
     * @param msg   消息
     * @param group   { sid : uid[] }
     */
    sendMsgByGroup(cmd, msg, group) {
        if (msg === undefined) {
            msg = null;
        }
        this.backendServer.sendMsgByGroup(cmd, msg, group);
    }
    /**
     * 配置服务器执行函数
     * @param type  服务器类型  "all"或者"gate|connector"形式
     * @param cb    执行函数
     */
    configure(type, cb) {
        if (type === "all") {
            cb.call(this);
            return;
        }
        let ts = type.split("|");
        for (let i = 0; i < ts.length; i++) {
            if (this.serverType === ts[i].trim()) {
                cb.call(this);
                break;
            }
        }
    }
}
exports.default = Application;
