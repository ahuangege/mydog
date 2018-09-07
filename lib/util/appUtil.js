var path = require("path");
var fs = require("fs");
var define = require("./define.js");
var master = require("../components/master.js");
var monitor = require("../components/monitor.js");
var rpcServer = require("../components/rpcServer.js");
var rpcService = require("../components/rpcService.js");
var frontendServer = require("../components/frontendServer.js");
var backendServer = require("../components/backendServer.js");
var remoteFrontend = require("../components/remoteFrontend.js");
var remoteBackend = require("../components/remoteBackend.js");


module.exports.defaultConfiguration = function (app) {
    var args = parseArgs(process.argv);
    app.env = args.env === "production" ? "production" : "development";
    loadMaster(app);
    loadRpcServers(app);
    loadServers(app);
    loadRouteConfig(app);
    processArgs(app, args);
};


module.exports.startServer = function (app) {
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
        } else if (value === "true") {
            value = true;
        } else if (value === "false") {
            value = false;
        }
        argsMap[key] = value;
    }

    return argsMap;
};

var loadMaster = function (app) {
    loadConfigBaseApp(app, "master", path.join(define.File_Dir.Config, 'master.json'));
};

var loadRpcServers = function (app) {
    loadConfigBaseApp(app, "rpcServersConfig", path.join(define.File_Dir.Config, 'rpc.json'));
};

var loadServers = function (app) {
    loadConfigBaseApp(app, "serversConfig", path.join(define.File_Dir.Config, 'servers.json'));
};

var loadRouteConfig = function (app) {
    loadConfigBaseApp(app, "routeConfig", path.join(define.File_Dir.Config, 'route.json'));
};


var loadConfigBaseApp = function (app, key, val) {
    var env = app.env;
    var originPath = path.join(app.base, val);
    if (fs.existsSync(originPath)) {
        var file = require(originPath);
        if (file[env]) {
            file = file[env];
        }
        app[key] = file;
    } else {
        console.error("ERROR-- no such file: " + originPath);
        process.exit();
    }
};

var processArgs = function (app, args) {
    app.main = args.main;
    app.serverType = args.serverType || "master";
    app.serverId = args.id || app.master.id;
    if (app.serverType === "master") {
        app.startMode = args.startMode === "alone" ? "alone" : "all";
        app.host = app.master.host;
        app.port = app.master.port;
    } else if (app.serverType === "rpc") {
        app.startMode = args.startMode === "all" ? "all" : "alone";
        var rpcServerConfig = app.rpcServersConfig;
        for (var i = 0; i < rpcServerConfig.length; i++) {
            if (rpcServerConfig[i].id === app.serverId) {
                rpcServerConfig = rpcServerConfig[i];
                break;
            }
        }
        app.host = args.host || rpcServerConfig.host;
        app.port = args.port || rpcServerConfig.port;
    } else {
        app.startMode = args.startMode === "all" ? "all" : "alone";
        var serverConfig = app.serversConfig[app.serverType];
        if (serverConfig) {
            for (var i = 0; i < serverConfig.length; i++) {
                if (serverConfig[i].id === app.serverId) {
                    serverConfig = serverConfig[i];
                    break;
                }
            }
        }
        serverConfig = serverConfig || {};
        app.host = args.host || serverConfig.host;
        app.port = args.port || serverConfig.port;

        var server = args;
        if (args.hasOwnProperty("frontend")) {
            app.frontend = args.frontend === true;
            server.frontend = app.frontend;
        } else {
            app.frontend = serverConfig.frontend === true;
        }

        if (args.hasOwnProperty("alone")) {
            app.alone = args.alone === true;
            server.alone = app.alone;
        } else {
            app.alone = serverConfig.alone === true;
        }

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
    var version = require("../mydog.js").version;
    version = "Ver: " + version;
    console.log("      ");
    console.log("      ");
    for (var i = 0; i < lines.length; i++) {
        if (i === 5) {
            var j;
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