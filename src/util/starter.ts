
import Application from "../application";
import * as cp from "child_process"
import * as util from "util"
import * as os from "os"
import { ServerInfo } from "./interfaceDefine";

let env: "production" | "development" = "development";

export function runServers(app: Application) {
    let servers = app.serversConfig;
    let server: ServerInfo;
    for (let serverType in servers) {
        let serverTypes = servers[serverType];
        for (let i = 0; i < serverTypes.length; i++) {
            server = serverTypes[i];
            server.serverType = serverType;
            run(app, server);
        }
    }
}


function run(app: Application, server: ServerInfo, cb?: Function) {
    env = app.env;
    let cmd, key;
    if (isLocal(server.host)) {
        let options: any[] = [];
        if (!!server.args) {
            if (typeof server.args === 'string') {
                options.push(server.args.trim());
            } else {
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
    } else {
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
};

function sshrun(cmd: string, host: string, cb?: Function) {
    let args = [];
    args.push(host);
    args.push(cmd);
    spawnProcess("ssh", host, args, cb);
};

function localrun(cmd: string, host: string, options: string[], callback?: Function) {
    spawnProcess(cmd, host, options, callback);
};

function spawnProcess(command: string, host: string, options: string[], cb?: Function) {
    let child = null;

    if (env === "development") {
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
    } else {
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
};

let isLocal = function (host: string) {
    return host === '127.0.0.1' || host === 'localhost' || host === '0.0.0.0' || inLocal(host);
};

let inLocal = function (host: string) {
    for (let index in localIps) {
        if (host === localIps[index]) {
            return true;
        }
    }
    return false;
};

let localIps = function () {
    let ifaces = os.networkInterfaces();
    let ips: string[] = [];
    let func = function (details: any) {
        if (details.family === 'IPv4') {
            ips.push(details.address);
        }
    };
    for (let dev in ifaces) {
        ifaces[dev].forEach(func);
    }
    return ips;
}();
