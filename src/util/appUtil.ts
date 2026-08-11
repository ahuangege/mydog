

import * as path from "path";
import * as fs from "fs";
import Application from "../application";
import { some_config } from "./define";
import * as monitor from "../components/monitor";
import * as rpcServer from "../components/rpcServer";
import * as rpcService from "../components/rpcService";
import { FrontendServer } from "../components/frontendServer";
import { BackendServer } from "../components/backendServer";
import { msgCoderSetApp } from "../components/msgCoder";
import { Master } from "../components/master";
import { ServerInfo } from "../mydog"

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
    if (app.isMaster) {
        new Master(app).start();
    } else if (app.frontend) {
        rpcService.init(app);
        app.frontendServer = new FrontendServer(app);

        rpcServer.start(app, function () {
            app.frontendServer.start(function () {
                monitor.start(app);
            });
        });

    } else {
        rpcService.init(app);
        app.backendServer = new BackendServer(app);

        rpcServer.start(app, function () {
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

let parseArgs = function (args: string[]) {
    let argsMap: I_startArg = {} as any;
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
        let endValue: any = value;
        if (!isNaN(Number(value)) && (value.indexOf('.') < 0)) {
            endValue = Number(value);
        } else if (value === "true") {
            endValue = true;
        } else if (value === "false") {
            endValue = false;
        }
        argsMap[key] = endValue;
    }

    return argsMap;
};


function loadCfgFile(app: Application, file: "master" | "servers" | "route") {
    try {
        const filePath = path.join(app.base, some_config.File_Dir.Config, file + ".js");
        return require(filePath).default;
    } catch (err) {
        console.error(err);
        process.exit();
    }
}


function loadMasterConfig(app: Application) {
    let env = app.env;
    const cfg: Record<string, ServerInfo> = loadCfgFile(app, "master");
    if (!cfg[env]) {
        console.error(new Error("ERROR-- no such environment: master.ts " + env));
        process.exit();
    }
    app.masterConfig = cfg[env];
}

function loadServersConfig(app: Application) {
    let env = app.env;
    const cfg: Record<string, { [serverType: string]: ServerInfo[] }> = loadCfgFile(app, "servers");
    const serversConfig = cfg[env] || {};
    parseServersConfig(serversConfig);
    app.serversConfig = serversConfig;
}


function loadRouteConfig(app: Application) {
    const cfg: string[] = loadCfgFile(app, "route");
    let arr: string[][] = [];
    for (let one of cfg) {
        arr.push((one as string).split("."));
    }
    app.routeConfig2 = arr;
    app.routeConfig = cfg;
}

let loadBaseConfig = function (app: Application) {
    loadMasterConfig(app);
    loadServersConfig(app);
    loadRouteConfig(app);
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


let processArgs = function (app: Application, args: I_startArg) {
    app.main = args.main;
    let startAlone = !!args.id;
    app.serverId = args.id || app.masterConfig.id;

    if (app.serverId === app.masterConfig.id) {
        app.isDaemon = !!args.daemon;
        app.serverInfo = JSON.parse(JSON.stringify(app.masterConfig));
        app.serverInfo.serverType = some_config.master;
        app.serverType = some_config.master;
        app.startMode = startAlone ? "alone" : "all";
        app.isMaster = true;
    } else {
        app.startMode = args.startMode === "all" ? "all" : "alone";
        let serverConfig: ServerInfo = null as any;
        for (let serverType in app.serversConfig) {
            if (serverType === some_config.master) {
                console.error(new Error("ERROR-- normal server cannot use serverType 'master' "));
                process.exit();
                return;
            }
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
            // servers.ts 配置里找不到，就从命令行参数里读
            delete args.main;
            delete args.env;
            delete args.daemon;
            delete args.startMode;
            serverConfig = args;

            if (!serverConfig.id || !serverConfig.host || !serverConfig.port || !serverConfig.serverType) {
                console.error(new Error("ERROR-- lack args " + JSON.stringify(args)));
                process.exit();
            }
            if (serverConfig.serverType === some_config.master) {
                console.error(new Error("ERROR-- cannot use serverType 'master' "));
                process.exit();
                return;
            }
        }

        app.serverInfo = serverConfig;
        app.frontend = !!serverConfig.frontend;
    }
};

function startPng(app: Application) {
    if (!app.isMaster && app.startMode === "all") {
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
    const packageJson = require("../../package.json");
    let version = packageJson.version;
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

export interface I_startArg extends ServerInfo {
    main?: string, // 启动程序 node 路径
    env?: string, // 应用环境
    daemon?: boolean, // 是否后台程序
    serverIds?: string[], // mydog start 启动时传入
    startMode?: "all" | "alone", // 启动方式
}