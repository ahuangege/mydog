"use strict";
/**
 * 启动环境检查
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
exports.getNoRpcKey = exports.startServer = exports.defaultConfiguration = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const define_1 = require("./define");
const master = __importStar(require("../components/master"));
const monitor = __importStar(require("../components/monitor"));
const rpcServer = __importStar(require("../components/rpcServer"));
const rpcService = __importStar(require("../components/rpcService"));
const frontendServer_1 = require("../components/frontendServer");
const backendServer_1 = require("../components/backendServer");
/**
 * 加载配置
 * @param app
 */
function defaultConfiguration(app) {
    let args = parseArgs(process.argv);
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
function getNoRpcKey(t1, t2) {
    if (t1 <= t2) {
        return t1 + "_" + t2;
    }
    else {
        return t2 + "_" + t1;
    }
}
exports.getNoRpcKey = getNoRpcKey;
let parseArgs = function (args) {
    let argsMap = {};
    let mainPos = 1;
    while (args[mainPos].indexOf('--') > 0) {
        mainPos++;
    }
    argsMap.main = args[mainPos];
    for (let i = (mainPos + 1); i < args.length; i++) {
        let arg = args[i];
        let sep = arg.indexOf('=');
        let key = arg.slice(0, sep);
        let value = arg.slice(sep + 1);
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
let loadBaseConfig = function (app) {
    loadConfigBaseApp(app, "masterConfig", path.join(define_1.some_config.File_Dir.Config, 'master.js'));
    loadConfigBaseApp(app, "serversConfig", path.join(define_1.some_config.File_Dir.Config, 'servers.js'));
    loadConfigBaseApp(app, "routeConfig", path.join(define_1.some_config.File_Dir.Config, 'route.js'));
    function loadConfigBaseApp(app, key, val) {
        let env = app.env;
        let originPath = path.join(app.base, val);
        if (fs.existsSync(originPath)) {
            let file = require(originPath).default;
            if (key === "masterConfig" || key === "serversConfig") {
                if (!file[env]) {
                    console.error("ERROR-- no such environment: " + key + "/" + env);
                    process.exit();
                }
                file = file[env];
            }
            if (key === "serversConfig") {
                parseServersConfig(file);
            }
            app[key] = file;
        }
        else {
            console.error("ERROR-- no such file: " + originPath);
            process.exit();
        }
    }
};
/** 解析servers配置 */
function parseServersConfig(info) {
    for (let svrT in info) {
        let arr = info[svrT];
        for (let i = 0; i < arr.length;) {
            if (arr[i].port instanceof Array) {
                let one = arr[i];
                let newArr = [];
                let idStart = one.idStart || 0;
                let port = one.port[0];
                let len = one.port[1] - one.port[0] + 1;
                for (let j = 0; j < len; j++) {
                    let tmpOne = JSON.parse(JSON.stringify(one));
                    tmpOne.id = one.id + (idStart + j).toString();
                    tmpOne.port = port + j;
                    if (one.clientPort) {
                        tmpOne.clientPort = one.clientPort + j;
                    }
                    newArr.push(tmpOne);
                }
                arr.splice(i, 1, ...newArr);
                i += len;
            }
            else {
                i++;
            }
        }
    }
}
let processArgs = function (app, args) {
    app.main = args.main;
    let startAlone = !!args.id;
    app.serverId = args.id || app.masterConfig.id;
    app.isDaemon = !!args.isDaemon;
    if (app.serverId === app.masterConfig.id) {
        app.serverInfo = app.masterConfig;
        app.serverType = "master";
        app.startMode = startAlone ? "alone" : "all";
    }
    else {
        app.startMode = args.startMode === "all" ? "all" : "alone";
        let serverConfig = null;
        for (let serverType in app.serversConfig) {
            for (let one of app.serversConfig[serverType]) {
                if (one.id === app.serverId) {
                    serverConfig = JSON.parse(JSON.stringify(one));
                    serverConfig.serverType = serverType;
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
        app.frontend = !!serverConfig.frontend;
        let servers = {};
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
    let lines = [
        "  ※----------------------※",
        "  ※   ----------------   ※",
        "  ※  ( mydog  @ahuang )  ※",
        "  ※   ----------------   ※",
        "  ※                      ※",
        "  ※                      ※",
        "  ※----------------------※",
    ];
    let version = require("../mydog").version;
    version = "Ver: " + version;
    console.log("      ");
    console.log("      ");
    for (let i = 0; i < lines.length; i++) {
        if (i === 5) {
            let j;
            let chars = lines[i].split('');
            let len = chars.length - 2 - version.length;
            len = Math.floor(len / 2);
            let index = 2 + len;
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
