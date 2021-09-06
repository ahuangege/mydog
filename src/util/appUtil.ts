

import * as path from "path";
import * as fs from "fs";
import Application from "../application";
import { some_config } from "./define";
import * as master from "../components/master";
import * as monitor from "../components/monitor";
import * as rpcServer from "../components/rpcServer";
import * as rpcService from "../components/rpcService";
import { FrontendServer } from "../components/frontendServer";
import { BackendServer } from "../components/backendServer";
import { ServerInfo } from "./interfaceDefine";
import { msgCoderSetApp } from "../components/msgCoder";


/**
 * Load configuration
 * @param app 
 */
export function defaultConfiguration(app: Application) {
    let args = parseArgs(process.argv);
    app.env = args.env || "development";
    loadBaseConfig(app);
    processArgs(app, args);
}

/**
 * Start the server
 * @param app 
 */
export function startServer(app: Application) {
    startPng(app);
    msgCoderSetApp(app);
    if (app.serverType === "master") {
        master.start(app);
    } else if (app.frontend) {
        rpcService.init(app);
        rpcServer.start(app, function () {
            app.frontendServer = new FrontendServer(app);
            app.frontendServer.start(function () {
                monitor.start(app);
            });
        });

    } else {
        rpcService.init(app);
        rpcServer.start(app, function () {
            app.backendServer = new BackendServer(app);
            app.backendServer.init();
            monitor.start(app);
        });
    }
};


export function getNoRpcKey(t1: string, t2: string) {
    if (t1 <= t2) {
        return t1 + "_" + t2;
    } else {
        return t2 + "_" + t1;
    }
}

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
            if (key === "masterConfig" || key === "serversConfig") {
                if (!file[env]) {
                    console.error("ERROR-- no such environment: " + key + "/" + env);
                    process.exit();
                }
                file = file[env];
            }
            if (key === "serversConfig") {
                parseServersConfig(file);
            } else if (key === "routeConfig") {
                let arr: string[][] = [];
                for (let one of file) {
                    arr.push((one as string).split("."));
                }
                app.routeConfig2 = arr;
            }

            app[key] = file;
        } else {
            console.error("ERROR-- no such file: " + originPath);
            process.exit();
        }
    }
};

/** Parse the servers configuration */
function parseServersConfig(info: { [serverType: string]: ServerInfo[] }) {
    for (let svrT in info) {
        let arr = info[svrT];
        for (let i = 0; i < arr.length;) {
            if ((arr[i].port as any) instanceof Array) {
                let one = arr[i];
                let newArr: ServerInfo[] = [];
                let idStart = one.idStart || 0;
                let port = (one.port as any)[0];
                let len = (one.port as any)[1] - (one.port as any)[0] + 1;
                for (let j = 0; j < len; j++) {
                    let tmpOne: any = JSON.parse(JSON.stringify(one));
                    tmpOne.id = one.id + (idStart + j).toString();
                    tmpOne.port = port + j;
                    if (one.clientPort) {
                        tmpOne.clientPort = one.clientPort + j;
                    }
                    newArr.push(tmpOne);
                }
                arr.splice(i, 1, ...newArr);
                i += len;
            } else {
                i++;
            }
        }
    }
}


let processArgs = function (app: Application, args: any) {
    app.main = args.main;
    let startAlone = !!args.id;
    app.serverId = args.id || app.masterConfig.id;
    app.isDaemon = !!args.isDaemon;
    if (app.serverId === app.masterConfig.id) {
        app.serverInfo = JSON.parse(JSON.stringify(app.masterConfig));
        (app.serverInfo as any).serverType = "master";
        app.serverType = "master";
        app.startMode = startAlone ? "alone" : "all";
    } else {
        app.startMode = args.startMode === "all" ? "all" : "alone";
        let serverConfig: ServerInfo = null as any;
        for (let serverType in app.serversConfig) {
            for (let one of app.serversConfig[serverType]) {
                if (one.id === app.serverId) {
                    serverConfig = JSON.parse(JSON.stringify(one));
                    (serverConfig as any).serverType = serverType;
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

        let servers: { [serverType: string]: ServerInfo[] } = {};
        servers[app.serverType] = [];
        servers[app.serverType].push(serverConfig);
        app.servers = servers;
        app.serversIdMap[serverConfig.id] = serverConfig;
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
}
