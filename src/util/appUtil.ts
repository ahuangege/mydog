/**
 * 启动环境检查
 */


import * as path from "path";
import * as fs from "fs";
import Application from "../application";
import { some_config } from "./define";
import { ServerInfo } from "./interfaceDefine";
import * as master from "../components/master";
import * as monitor from "../components/monitor";
import * as rpcServer from "../components/rpcServer";
import * as rpcService from "../components/rpcService";
import { FrontendServer } from "../components/frontendServer";
import { BackendServer } from "../components/backendServer";


/**
 * 加载配置
 * @param app 
 */
export function defaultConfiguration(app: Application) {
    let args = parseArgs(process.argv);
    app.env = args.env === "production" ? "production" : "development";
    loadBaseConfig(app);
    processArgs(app, args);
}

/**
 * 启动服务器
 * @param app 
 */
export function startServer(app: Application) {
    startPng(app);
    if (app.serverType === "master") {
        master.start(app);
    } else if (app.frontend) {
        rpcServer.start(app, function () {
            app.frontendServer = new FrontendServer(app);
            app.frontendServer.start(function () {
                rpcService.init(app);
                monitor.start(app);
            });
        });

    } else {
        rpcServer.start(app, function () {
            app.backendServer = new BackendServer(app);
            app.backendServer.init();
            rpcService.init(app);
            monitor.start(app);
        });
    }
};


let parseArgs = function (args: any[]) {
    let argsMap = {} as any;
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
        } else if (value === "true") {
            value = true;
        } else if (value === "false") {
            value = false;
        }
        argsMap[key] = value;
    }

    return argsMap;
};


let loadBaseConfig = function (app: Application) {
    loadConfigBaseApp(app, "masterConfig", path.join(some_config.File_Dir.Config, 'master.js'));
    loadConfigBaseApp(app, "serversConfig", path.join(some_config.File_Dir.Config, 'servers.js'));
    loadConfigBaseApp(app, "routeConfig", path.join(some_config.File_Dir.Config, 'route.js'));

    function loadConfigBaseApp(app: Application, key: "masterConfig" | "serversConfig" | "routeConfig", val: string) {
        let env = app.env;
        let originPath = path.join(app.base, val);
        if (fs.existsSync(originPath)) {
            let file = require(originPath).default;
            if (file[env]) {
                file = file[env];
            }
            app[key] = file;
        } else {
            console.error("ERROR-- no such file: " + originPath);
            process.exit();
        }
    }
};



let processArgs = function (app: Application, args: any) {
    app.main = args.main;
    app.serverId = args.id || app.masterConfig.id;
    if (app.serverId === app.masterConfig.id) {
        app.serverType = "master";
        app.startMode = args.startMode === "alone" ? "alone" : "all";
        app.host = app.masterConfig.host;
        app.port = app.masterConfig.port;
    } else {
        app.startMode = args.startMode === "all" ? "all" : "alone";
        let serverConfig: ServerInfo = {} as any;
        let tmpServerType: string = "";
        for (let serverType in app.serversConfig) {
            for (let one of app.serversConfig[serverType]) {
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

        let server: ServerInfo = args;
        if (args.hasOwnProperty("frontend")) {
            app.frontend = args.frontend === true;
        } else {
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


        let servers: { [serverType: string]: ServerInfo[] } = {};
        servers[app.serverType] = [];
        servers[app.serverType].push(server);
        app.serverInfo = server;
        app.servers = servers;
        app.serversIdMap[server.id] = server;
    }
};

function startPng(app: Application) {
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

export function concatStr(...args: (string | number)[]) {
    let str = "";
    for (let one of args) {
        str += one
    }
    return str;
}