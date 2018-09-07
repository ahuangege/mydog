var path = require("path");
var appUtil = null;
var msgCoder = require("./components/msgCoder.js");
var define = require("./util/define.js");
var hasStarted = false;

var Application = module.exports = {};

/**
 * 初始化
 */
Application.init = function () {
    this.settings = {};             // 用户设置键值对
    this.clients = {};              // 绑定了的客户端      》前端专用
    this.clientNum = 0;             // 所有客户端数量      》前端专用

    this.main = null;               // 启动源程序
    this.base = path.dirname(require.main.filename);    // 项目根目录
    this.env = "";                // 环境配置

    this.routeConfig = null;      // route.json
    this.master = null;           // master.json
    this.rpcServersConfig = null; // rpc.json
    this.serversConfig = null;    // servers.json

    this.servers = {};            // 正在运行的所有用户服务器
    this.serversIdMap = {};       // 正在运行的所有用户服务器（字典格式）
    this.rpcServersIdMap = {};    // 正在运行的所有rpc服务器（字典格式）
    this.serverToken = define.Server_Token;   // 服务器内部认识密钥
    this.clientToken = define.Master_Client_Token;   // master服务器接受cli的密匙

    this.serverInfo = null;       // 本服务器的配置
    this.host = null;             // ip
    this.port = null;             // port
    this.serverId = null;         // 服务器名字id， 服务器唯一标识
    this.serverType = null;       // 服务器类型
    this.frontend = false;        // 是否是前端服务器
    this.alone = null;            // 是否是单独的（前端与后端是否相连接）
    this.startMode = null;        // 启动方式  all / alone
    this.startTime = null;        // 启动时刻

    this.router = {};             // 路由消息到后端时的前置选择
    this.rpcRouter = {};          // rpc消息时的前置选择
    this.rpc = {};                // rpc包装
    this.rpcService = null;       // 用户服务器，rpc管理
    this.remoteBackend = null;    // 后端服务器，用来管理前端连接
    this.remoteFrontend = null;   // 前端服务器，用来管理连接后端
    this.logger = function () {   // 内部日志输出口
    };

    appUtil = require("./util/appUtil");
    appUtil.defaultConfiguration(this);
};

/**
 * 服务器启动
 */
Application.start = function () {
    if(hasStarted){
        console.error("the app has already started");
        return;
    }
    hasStarted = true;
    this.startTime = new Date().getTime();
    appUtil.startServer(this);
};

/**
 * 项目根目录
 */
Application.getBase = function () {
    return this.base;
};

/**
 * 设置键值对
 * @param key 键
 * @param value 值
 */
Application.set = function (key, value) {
    this.settings[key] = value;
};

/**
 * 获取键key对应的值
 * @param key 键名
 * @returns
 */
Application.get = function (key) {
    return this.settings[key];
};

/**
 * 删除某一个键值对
 * @param key 键名
 */
Application.delete = function (key) {
    delete this.settings[key];
};

/**
 * 获取master服务器配置
 * @returns {null}
 */
Application.getMaster = function () {
    return this.master;
};

/**
 * 运行中的所有的用户服务器配置
 * @returns
 */
Application.getServers = function () {
    return this.servers;
};

/**
 * 运行中的所有的用户服务器配置（id形式）
 * @returns
 */
Application.getServersIdMap = function () {
    return this.serversIdMap;
};

/**
 * 根据服务器类型获取服务器数组
 * @param serverType 服务器类型
 * @returns
 */
Application.getServersByType = function (serverType) {
    return this.servers[serverType];
};

/**
 * 获取某一个服务器配置
 * @param serverId 服务器id
 * @returns
 */
Application.getServerById = function (serverId) {
    return this.serversIdMap[serverId];
};

/**
 * 获取用户服务器配置
 * @returns
 */
Application.getServersConfig = function () {
    return this.serversConfig;
};

/**
 * 获取运行中的rpc服务器
 * @returns
 */
Application.getRpcServersIdMap = function () {
    return this.rpcServersIdMap;
};

/**
 * 获取rpc服务器配置
 * @returns
 */
Application.getRpcServersConfig = function () {
    return this.rpcServersConfig;
};

/**
 * 路由配置 (决定前端调用哪个后端)      》前端专用
 * @param serverType 后端服务器类型
 * @param routeFunc 配置函数
 */
Application.route = function (serverType, routeFunc) {
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
Application.rpcRoute = function (serverType, routeFunc) {
    if (typeof routeFunc !== "function") {
        console.error("app.rpcRoute() --- cb must be a function");
        return;
    }
    this.rpcRouter[serverType] = routeFunc;
};

/**
 * 获取某个绑定的客户端     》前端专用
 * @param uid 客户端绑定的uid
 * @returns
 */
Application.getClient = function (uid) {
    return this.clients[uid];
};

/**
 * 是否有绑定的客户端     》前端专用
 * @param uid 客户端绑定的uid
 * @returns
 */
Application.hasClient = function (uid) {
    return !!this.clients[uid];
};


/**
 * 获取所有绑定的客户端     》前端专用
 * @returns
 */
Application.getAllClients = function () {
    return this.clients;
};

/**
 * 所有的客户端连接数量   》前端专用
 * @returns
 */
Application.getClientNum = function () {
    return this.clientNum;
};

/**
 * 关闭客户端       》前端专用
 * @param uid 客户端绑定的uid
 */
Application.closeClient = function (uid) {
    var client = this.clients[uid];
    if (client) {
        client.socket.close();
    }
};

/**
 * 配置session       》前端专用
 * @param uid 客户端绑定的uid
 * @param session 配置
 */
Application.applySession = function (uid, session) {
    var client = this.clients[uid];
    if (client) {
        client.setAll(session);
    }
};

/**
 * 配置部分session         》前端专用
 * @param uid 客户端绑定的uid
 * @param some 部分配置
 */
Application.applySomeSession = function (uid, some) {
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
Application.sendMsgByUid = function (cmd, msg, uids) {
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
    var msgBuf = msgCoder.encodeClientData(cmdIndex, msg);
    var client = null;
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
Application.sendAll = function (cmd, msg) {
    if (!this.frontend) {
        console.error("app.sendAll() --- backend server cannot use this method");
        return;
    }
    var cmdIndex = this.routeConfig.indexOf(cmd);
    if (cmdIndex === -1) {
        console.error("app.sendAll() --- no such route : " + cmd);
        return;
    }

    var data = msgCoder.encodeClientData(cmdIndex, msg);
    for (var uid in this.clients) {
        this.clients[uid].socket.send(data)
    }
};

/**
 * 向客户端发送消息     》后端专用
 * @param cmd   路由
 * @param msg   消息
 * @param uids  uid数组 [1,2]
 * @param sids  sid数组 ["connector-server-1", "connector-server-2"]
 */
Application.sendMsgByUidSid = function (cmd, msg, uids, sids) {
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
Application.configure = function (type, cb) {
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
Application.onLog = function (cb) {
    if (typeof cb !== "function") {
        console.error("app.onLog() --- cb must be a function")
    }
    this.logger = cb;
};

/**
 * 加载模块
 * @param dir  相对根目录的路径
 * @returns
 */
Application.loadFile = function (dir) {
    dir = path.join(this.base, dir);
    return require(dir)
};