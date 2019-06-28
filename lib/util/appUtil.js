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
    else if (app.frontend) {
        rpcServer.start(app, function () {
            app.frontendServer.start(function () {
                rpcService.init(app);
                monitor.start(app);
            });
        });
    }
    else {
        rpcServer.start(app, function () {
            app.backendServer.init();
            rpcService.init(app);
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
    app.serverId = args.id || app.masterConfig.id;
    if (app.serverId === app.masterConfig.id) {
        app.serverType = "master";
        app.startMode = args.startMode === "alone" ? "alone" : "all";
        app.host = app.masterConfig.host;
        app.port = app.masterConfig.port;
    }
    else {
        app.startMode = args.startMode === "all" ? "all" : "alone";
        var serverConfig = {};
        var tmpServerType = "";
        for (var serverType in app.serversConfig) {
            for (var _i = 0, _a = app.serversConfig[serverType]; _i < _a.length; _i++) {
                var one = _a[_i];
                if (one.id === app.serverId) {
                    serverConfig = one;
                    tmpServerType = serverType;
                    break;
                }
            }
        }
        app.serverType = args.serverType || tmpServerType;
        app.host = args.host || serverConfig.host;
        app.port = args.port || serverConfig.port;
        if (!app.serverType || !app.host || !app.port) {
            throw Error("param error");
        }
        app.clientPort = args.clientPort || serverConfig.clientPort;
        var server = args;
        if (args.hasOwnProperty("frontend")) {
            app.frontend = args.frontend === true;
        }
        else {
            app.frontend = serverConfig.frontend === true;
        }
        server.frontend = app.frontend;
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
    var version = require("../mydog").version;
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
function concatStr() {
    var args = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments[_i];
    }
    var str = "";
    for (var _a = 0, args_1 = args; _a < args_1.length; _a++) {
        var one = args_1[_a];
        str += one;
    }
    return str;
}
exports.concatStr = concatStr;
