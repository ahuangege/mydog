"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
var cp = __importStar(require("child_process"));
var util = __importStar(require("util"));
var os = __importStar(require("os"));
var env = "development";
function runServers(app) {
    var servers = app.serversConfig;
    var server;
    for (var serverType in servers) {
        var serverTypes = servers[serverType];
        for (var i = 0; i < serverTypes.length; i++) {
            server = serverTypes[i];
            server.serverType = serverType;
            run(app, server);
        }
    }
}
exports.runServers = runServers;
function run(app, server, cb) {
    env = app.env;
    var cmd, key;
    if (isLocal(server.host)) {
        var options = [];
        if (!!server.args) {
            if (typeof server.args === 'string') {
                options.push(server.args.trim());
            }
            else {
                options = options.concat(server.args);
            }
        }
        cmd = app.main;
        options.push(cmd);
        options.push(util.format('env=%s', env));
        for (key in server) {
            options.push(util.format('%s=%s', key, server[key]));
        }
        options.push(util.format('%s=%s', "startMode", app.startMode));
        localrun(process.execPath, "", options, cb);
    }
    else {
        cmd = util.format('cd "%s" && "%s"', app.base, process.execPath);
        var arg = server.args;
        if (arg !== undefined) {
            cmd += arg;
        }
        cmd += util.format(' "%s" env=%s ', app.main, env);
        for (key in server) {
            cmd += util.format(' %s=%s ', key, server[key]);
        }
        sshrun(cmd, server.host, cb);
    }
}
;
function sshrun(cmd, host, cb) {
    var args = [];
    args.push(host);
    args.push(cmd);
    spawnProcess("ssh", host, args, cb);
}
;
function localrun(cmd, host, options, callback) {
    spawnProcess(cmd, host, options, callback);
}
;
function spawnProcess(command, host, options, cb) {
    var child = null;
    if (env === "development") {
        child = cp.spawn(command, options);
        var prefix_1 = command === "ssh" ? '[' + host + '] ' : '';
        child.stderr.on('data', function (chunk) {
            var msg = chunk.toString();
            process.stderr.write(msg);
            if (!!cb) {
                cb(msg);
            }
        });
        child.stdout.on('data', function (chunk) {
            var msg = prefix_1 + chunk.toString();
            process.stdout.write(msg);
        });
    }
    else {
        child = cp.spawn(command, options, { detached: true, stdio: 'inherit' });
        child.unref();
    }
    child.on('exit', function (code) {
        if (code !== 0) {
            console.error('child process exit with error, error code: %s, executed command: %s', code, command);
        }
        if (typeof cb === 'function') {
            cb(code === 0 ? null : code);
        }
    });
}
;
var isLocal = function (host) {
    return host === '127.0.0.1' || host === 'localhost' || host === '0.0.0.0' || inLocal(host);
};
var inLocal = function (host) {
    for (var index in localIps) {
        if (host === localIps[index]) {
            return true;
        }
    }
    return false;
};
var localIps = function () {
    var ifaces = os.networkInterfaces();
    var ips = [];
    var func = function (details) {
        if (details.family === 'IPv4') {
            ips.push(details.address);
        }
    };
    for (var dev in ifaces) {
        ifaces[dev].forEach(func);
    }
    return ips;
}();
