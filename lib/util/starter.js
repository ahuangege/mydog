"use strict";
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
exports.runServers = void 0;
const cp = __importStar(require("child_process"));
const util = __importStar(require("util"));
const os = __importStar(require("os"));
let app = null;
function runServers(_app) {
    app = _app;
    let servers = app.serversConfig;
    let server;
    for (let serverType in servers) {
        let serverTypes = servers[serverType];
        for (let i = 0; i < serverTypes.length; i++) {
            server = serverTypes[i];
            run(server);
        }
    }
}
exports.runServers = runServers;
function run(server, cb) {
    let cmd, key;
    if (isLocal(server.host)) {
        let options = [];
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
        options.push(util.format('id=%s', server.id));
        options.push(util.format('env=%s', app.env));
        options.push(util.format('startMode=%s', app.startMode));
        localrun(process.execPath, "", options, cb);
    }
    else {
        cmd = util.format('cd "%s" && "%s"', app.base, process.execPath);
        var arg = server.args;
        if (arg !== undefined) {
            cmd += arg;
        }
        cmd += util.format(' "%s" id=%s env=%s startMode=%s', app.main, server.id, app.env, app.startMode);
        sshrun(cmd, server.host, cb);
    }
}
;
function sshrun(cmd, host, cb) {
    let args = [];
    args.push(host);
    let ssh_params = app.someconfig.ssh;
    if (!!ssh_params && Array.isArray(ssh_params)) {
        args = args.concat(ssh_params);
    }
    args.push(cmd);
    spawnProcess("ssh", host, args, cb);
}
;
function localrun(cmd, host, options, callback) {
    spawnProcess(cmd, host, options, callback);
}
;
function spawnProcess(command, host, options, cb) {
    let child = null;
    if (app.isDaemon) {
        child = cp.spawn(command, options, { detached: true, stdio: 'ignore' });
        child.unref();
    }
    else {
        child = cp.spawn(command, options);
        let prefix = command === "ssh" ? '[' + host + '] ' : '';
        child.stderr.on('data', function (chunk) {
            let msg = chunk.toString();
            process.stderr.write(msg);
            if (!!cb) {
                cb(msg);
            }
        });
        child.stdout.on('data', function (chunk) {
            let msg = prefix + chunk.toString();
            process.stdout.write(msg);
        });
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
let isLocal = function (host) {
    return host === '127.0.0.1' || host === 'localhost' || host === '0.0.0.0' || inLocal(host);
};
let inLocal = function (host) {
    return localIps.indexOf(host) !== -1;
};
let localIps = function () {
    let ifaces = os.networkInterfaces();
    let ips = [];
    let func = function (details) {
        if (details.family === 'IPv4') {
            ips.push(details.address);
        }
    };
    for (let dev in ifaces) {
        ifaces[dev].forEach(func);
    }
    return ips;
}();
