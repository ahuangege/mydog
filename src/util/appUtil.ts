/**
 * 启动环境检查
 */


import * as path from "path";
import * as fs from "fs";
import Application from "../application";
import define from "./define";
import { ServerInfo } from "./interfaceDefine";
import * as master from "../components/master";
import * as monitor from "../components/monitor";
import * as rpcServer from "../components/rpcServer";
import * as rpcService from "../components/rpcService";
import * as frontendServer from "../components/frontendServer";
import * as backendServer from "../components/backendServer";
import * as remoteFrontend from "../components/remoteFrontend";
import * as remoteBackend from "../components/remoteBackend";

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
    } else if (app.serverType === "rpc") {

        rpcServer.start(app, function () {
            monitor.start(app);
        });

    } else if (app.frontend) {

        frontendServer.start(app, function () {
            rpcService.init(app);
            remoteFrontend.init(app);
            monitor.start(app);
        });

    } else {

        backendServer.start(app, function () {
            rpcService.init(app);
            remoteBackend.init(app);
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
    loadConfigBaseApp(app, "masterConfig", path.join(define.File_Dir.Config, 'master.json'));
    loadConfigBaseApp(app, "rpcServersConfig", path.join(define.File_Dir.Config, 'rpc.json'));
    loadConfigBaseApp(app, "serversConfig", path.join(define.File_Dir.Config, 'servers.json'));
    loadConfigBaseApp(app, "routeConfig", path.join(define.File_Dir.Config, 'route.json'));

    function loadConfigBaseApp(app: Application, key: "masterConfig" | "rpcServersConfig" | "serversConfig" | "routeConfig", val: string) {
        let env = app.env;
        let originPath = path.join(app.base, val);
        if (fs.existsSync(originPath)) {
            let file = require(originPath);
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
    app.serverType = args.serverType || "master";
    app.serverId = args.id || app.masterConfig.id;
    if (app.serverType === "master") {
        app.startMode = args.startMode === "alone" ? "alone" : "all";
        app.host = app.masterConfig.host;
        app.port = app.masterConfig.port;
    } else if (app.serverType === "rpc") {
        app.startMode = args.startMode === "all" ? "all" : "alone";
        let rpcServersConfig = app.rpcServersConfig;
        let rpcServerConfig: ServerInfo = {} as any;
        for (let i = 0; i < rpcServersConfig.length; i++) {
            if (rpcServersConfig[i].id === app.serverId) {
                rpcServerConfig = rpcServersConfig[i];
                break;
            }
        }
        app.host = args.host || rpcServerConfig.host;
        app.port = args.port || rpcServerConfig.port;
    } else {
        app.startMode = args.startMode === "all" ? "all" : "alone";
        let serversConfig = app.serversConfig[app.serverType];
        let serverConfig: ServerInfo = {} as any;
        if (serversConfig) {
            for (let i = 0; i < serversConfig.length; i++) {
                if (serversConfig[i].id === app.serverId) {
                    serverConfig = serversConfig[i];
                    break;
                }
            }
        }
        app.host = args.host || serverConfig.host;
        app.port = args.port || serverConfig.port;

        let server: ServerInfo = args;
        if (args.hasOwnProperty("frontend")) {
            app.frontend = args.frontend === true;
        } else {
            app.frontend = serverConfig.frontend === true;
        }
        server.frontend = app.frontend;


        if (args.hasOwnProperty("alone")) {
            app.alone = args.alone === true;
        } else {
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
        "  ※    QQ群:875459630    ※",
        "  ※                      ※",
        "  ※----------------------※",
    ];
    let version = require("../mydog.js").default.version;
    version = "Ver: " + version;
    console.log("      ");
    console.log("      ");
    for (let i = 0; i < lines.length; i++) {
        if (i === 6) {
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