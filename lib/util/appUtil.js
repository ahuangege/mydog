"use strict";
/**
 * 启动环境检查
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
var define_1 = require("./define");
var master = __importStar(require("../components/master"));
var monitor = __importStar(require("../components/monitor"));
var rpcServer = __importStar(require("../components/rpcServer"));
var rpcService = __importStar(require("../components/rpcService"));
var frontendServer = __importStar(require("../components/frontendServer"));
var backendServer = __importStar(require("../components/backendServer"));
var remoteFrontend = __importStar(require("../components/remoteFrontend"));
var remoteBackend = __importStar(require("../components/remoteBackend"));
/**
 * 加载配置
 * @param app
 */
function defaultConfiguration(app) {
    var args = parseArgs(process.argv);
    app.env = args.env === "production" ? "production" : "development";
    loadBaseConfig(app);
    processArgs(app, args);
}
exports.defaultConfiguration = defaultConfiguration;
/**
 * 启动服务器
 * @param app
 */
function startServer(app) {
    startPng(app);
    if (app.serverType === "master") {
        master.start(app);
    }
    else if (app.serverType === "rpc") {
        rpcServer.start(app, function () {
            monitor.start(app);
        });
    }
    else if (app.frontend) {
        frontendServer.start(app, function () {
            rpcService.init(app);
            remoteFrontend.init(app);
            monitor.start(app);
        });
    }
    else {
        backendServer.start(app, function () {
            rpcService.init(app);
            remoteBackend.init(app);
            monitor.start(app);
        });
    }
}
exports.startServer = startServer;
;
var parseArgs = function (args) {
    var argsMap = {};
    var mainPos = 1;
    while (args[mainPos].indexOf('--') > 0) {
        mainPos++;
    }
    argsMap.main = args[mainPos];
    for (var i = (mainPos + 1); i < args.length; i++) {
        var arg = args[i];
        var sep = arg.indexOf('=');
        var key = arg.slice(0, sep);
        var value = arg.slice(sep + 1);
        if (!isNaN(Number(value)) && (value.indexOf('.') < 0)) {
            value = Number(value);
        }
        else if (value === "true") {
            value = true;
        }
        else if (value === "false") {
            value = false;
        }
        argsMap[key] = value;
    }
    return argsMap;
};
var loadBaseConfig = function (app) {
    loadConfigBaseApp(app, "masterConfig", path.join(define_1.some_config.File_Dir.Config, 'master.js'));
    loadConfigBaseApp(app, "rpcServersConfig", path.join(define_1.some_config.File_Dir.Config, 'rpc.js'));
    loadConfigBaseApp(app, "serversConfig", path.join(define_1.some_config.File_Dir.Config, 'servers.js'));
    loadConfigBaseApp(app, "routeConfig", path.join(define_1.some_config.File_Dir.Config, 'route.js'));
    function loadConfigBaseApp(app, key, val) {
        var env = app.env;
        var originPath = path.join(app.base, val);
        if (fs.existsSync(originPath)) {
            var file = require(originPath).default;
            if (file[env]) {
                file = file[env];
            }
            app[key] = file;
        }
        else {
            console.error("ERROR-- no such file: " + originPath);
            process.exit();
        }
    }
};
var processArgs = function (app, args) {
    app.main = args.main;
    app.serverType = args.serverType || "master";
    app.serverId = args.id || app.masterConfig.id;
    if (app.serverType === "master") {
        app.startMode = args.startMode === "alone" ? "alone" : "all";
        app.host = app.masterConfig.host;
        app.port = app.masterConfig.port;
    }
    else if (app.serverType === "rpc") {
        app.startMode = args.startMode === "all" ? "all" : "alone";
        var rpcServersConfig = app.rpcServersConfig;
        var rpcServerConfig = {};
        for (var i = 0; i < rpcServersConfig.length; i++) {
            if (rpcServersConfig[i].id === app.serverId) {
                rpcServerConfig = rpcServersConfig[i];
                break;
            }
        }
        app.host = args.host || rpcServerConfig.host;
        app.port = args.port || rpcServerConfig.port;
    }
    else {
        app.startMode = args.startMode === "all" ? "all" : "alone";
        var serversConfig = app.serversConfig[app.serverType];
        var serverConfig = {};
        if (serversConfig) {
            for (var i = 0; i < serversConfig.length; i++) {
                if (serversConfig[i].id === app.serverId) {
                    serverConfig = serversConfig[i];
                    break;
                }
            }
        }
        app.host = args.host || serverConfig.host;
        app.port = args.port || serverConfig.port;
        var server = args;
        if (args.hasOwnProperty("frontend")) {
            app.frontend = args.frontend === true;
        }
        else {
            app.frontend = serverConfig.frontend === true;
        }
        server.frontend = app.frontend;
        if (args.hasOwnProperty("alone")) {
            app.alone = args.alone === true;
        }
        else {
            app.alone = serverConfig.alone === true;
        }
        server.alone = app.alone;
        delete server["main"];
        delete server["env"];
        delete server["serverType"];
        delete server["startMode"];
        server["id"] = app.serverId;
        server["host"] = app.host;
        server["port"] = app.port;
        var servers = {};
        servers[app.serverType] = [];
        servers[app.serverType].push(server);
        app.serverInfo = server;
        app.servers = servers;
        app.serversIdMap[server.id] = server;
    }
};
function startPng(app) {
    if (app.serverType !== "master" && app.startMode === "all") {
        return;
    }
    var lines = [
        "  ※----------------------※",
        "  ※   ----------------   ※",
        "  ※  ( mydog  @ahuang )  ※",
        "  ※   ----------------   ※",
        "  ※                      ※",
        "  ※                      ※",
        "  ※----------------------※",
    ];
    var version = require("../mydog.js").default.version;
    version = "Ver: " + version;
    console.log("      ");
    console.log("      ");
    for (var i = 0; i < lines.length; i++) {
        if (i === 5) {
            var j = void 0;
            var chars = lines[i].split('');
            var len = chars.length - 2 - version.length;
            len = Math.floor(len / 2);
            var index = 2 + len;
            for (j = 0; j < version.length; j++) {
                chars[index + j] = version[j];
            }
            lines[i] = chars.join('');
        }
        console.log(lines[i]);
    }
    console.log("  ");
    console.log("  ");
}
