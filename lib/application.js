var nowFileName = "application";
var path = require("path");
var appUtil = null;
var msgCoder = require("./components/msgCoder.js");

var Application = module.exports = {};

Application.init = function () {
    this.settings = {};             // key/value dictionary (app.set, app.get)
    this.clients = {};              // client map (only for frontend server)
    this.clientNum = 0;             // client num (only for frontend server)

    this.main = null;
    this.base = path.dirname(require.main.filename);
    this.env = "";

    this.master = null;           // master info (from the config)
    this.rpcServersConfig = null; // rpc servers info (from the config)
    this.serversConfig = null;    // servers info (from the config)
    this.servers = {};            // servers info (runtime servers info, developer can add or remove server dynamically)
    this.routeConfig = null;      // route info (from the config)
    this.serverToken = "admin";   // the password used when server register to another one

    this.host = null;             // current server ip
    this.port = null;             // current server port
    this.serverId = null;         // current server id
    this.serverType = null;       // current server type
    this.frontend = null;         // is frontend server ?
    this.noBack = null;           // frontend server need to connect to backend server ?
    this.startMode = null;        // start mode: all or alone
    this.startTime = null;        // current server start time

    this.router = {};             // the rule used when frontend server send message to backend server, to decide which one to choose
    this.rpc = null;              // used for rpc message
    this.rpcService = null;       // normal server use it to manage rpc server
    this.remoteBackend = null;    // backend server use it to manage frontend server connected to it (only for backend server)
    this.remoteFrontend = null;   // frontend server use it to manage backend server it connect to (only for frontend server with backend server)
    this.ifLogRoute = true;       // if frontend server log route when data coming
    this.logger = function () {   // mydog framework print msg using this function
    };

    appUtil = require("./util/appUtil");
    appUtil.defaultConfiguration(this);
};

Application.start = function () {
    this.startTime = new Date().getTime();
    appUtil.startServer(this);
};


Application.getBase = function () {
    return this.base;
};


Application.set = function (setting, val) {
    this.settings[setting] = val;
};


Application.get = function (setting) {
    return this.settings[setting];
};

Application.getAll = function () {
    return this.settings;
};

Application.delete = function (setting) {
    delete this.settings[setting];
};

Application.getMaster = function () {
    return this.master;
};

Application.getServers = function () {
    return this.servers;
};

Application.getServersByType = function (type) {
    return this.servers[type];
};

Application.getServersConfig = function () {
    return this.serversConfig;
};

Application.route = function (serverType, routeFunc) {
    if (typeof routeFunc !== "function") {
        console.error("app.route() --- cb must be a function");
        return;
    }
    this.router[serverType] = routeFunc;
};

Application.getClient = function (uid) {
    return this.clients[uid];
};


Application.getAllClients = function () {
    return this.clients;
};

Application.getClientNum = function () {
    return this.clientNum;
};

Application.closeClient = function (uid) {
    var client = this.clients[uid];
    if (client) {
        client.socket.close();
    }
};

Application.applySession = function (uid, session) {
    var client = this.clients[uid];
    if (client) {
        client.setAll(session);
    }
};

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
    this.sendMsgByUid2(cmdIndex, msg, uids);
};

//inner method, user must not use it
Application.sendMsgByUid2 = function (cmdIndex, msg, uids) {
    var data = msgCoder.encodeClientData(cmdIndex, msg);
    var client = null;
    for (var i = 0; i < uids.length; i++) {
        client = this.clients[uids[i]];
        if (client) {
            client.socket.send(data);
        }
    }
};

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
    this.remoteBackend.sendMsgByUidSid(cmdIndex, msg, uids, sids);
};

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

Application.onLog = function (cb) {
    if (typeof cb !== "function") {
        console.error("app.onLog() --- cb must be a function")
    }
    this.logger = cb;
};

Application.loadFile = function (dir) {
    dir = path.join(this.base, dir);
    return require(dir)
};