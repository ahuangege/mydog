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
var frontendServer_1 = require("../components/frontendServer");
var backendServer_1 = require("../components/backendServer");
/**
 * 加载配置
 * @param app
 */
function defaultConfiguration(app) {
    var args = parseArgs(process.argv);
    app.env = args.env || "development";
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
        rpcService.init(app);
        rpcServer.start(app, function () {
            app.frontendServer = new frontendServer_1.FrontendServer(app);
            app.frontendServer.start(function () {
                monitor.start(app);
            });
        });
    }
    else {
        rpcService.init(app);
        rpcServer.start(app, function () {
            app.backendServer = new backendServer_1.BackendServer(app);
            app.backendServer.init();
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
            if (key === "masterConfig" || key === "serversConfig") {
                if (!file[env]) {
                    console.error("ERROR-- no such environment: " + key + "/" + env);
                    process.exit();
                }
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
    var startAlone = !!args.id;
    app.serverId = args.id || app.masterConfig.id;
    app.isDaemon = !!args.isDaemon;
    if (app.serverId === app.masterConfig.id) {
        app.serverInfo = app.masterConfig;
        app.serverType = "master";
        app.startMode = startAlone ? "alone" : "all";
        app.host = app.masterConfig.host;
        app.port = app.masterConfig.port;
    }
    else {
        app.startMode = args.startMode === "all" ? "all" : "alone";
        var serverConfig = null;
        for (var serverType in app.serversConfig) {
            for (var _i = 0, _a = app.serversConfig[serverType]; _i < _a.length; _i++) {
                var one = _a[_i];
                if (one.id === app.serverId) {
                    serverConfig = one;
                    app.serverType = serverType;
                    break;
                }
            }
            if (serverConfig) {
                break;
            }
        }
        if (!serverConfig) {
            console.error("ERROR-- no such server: " + app.serverId);
            process.exit();
        }
        app.serverInfo = serverConfig;
        app.host = serverConfig.host;
        app.port = serverConfig.port;
        app.frontend = !!serverConfig.frontend;
        app.clientPort = serverConfig.clientPort || 0;
        var servers = {};
        servers[app.serverType] = [];
        servers[app.serverType].push(serverConfig);
        app.servers = servers;
        app.serversIdMap[serverConfig.id] = serverConfig;
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
