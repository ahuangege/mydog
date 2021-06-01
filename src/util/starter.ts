
import Application from "../application";
import * as cp from "child_process"
import * as util from "util"
import * as os from "os"
import { ServerInfo } from "../util/interfaceDefine";

let app: Application = null as any;

export function runServers(_app: Application) {
    app = _app;
    let servers = app.serversConfig;
    let server: ServerInfo;
    for (let serverType in servers) {
        let serverTypes = servers[serverType];
        for (let i = 0; i < serverTypes.length; i++) {
            server = serverTypes[i];
            run(server);
        }
    }
}


function run(server: ServerInfo, cb?: Function) {
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
        options.push(util.format('id=%s', server.id));
        options.push(util.format('env=%s', app.env));
        options.push(util.format('startMode=%s', app.startMode));
        localrun(process.execPath, "", options, cb);
    } else {
        cmd = util.format('cd "%s" && "%s"', app.base, process.execPath);
        var arg = server.args;
        if (arg !== undefined) {
            cmd += arg;
        }
        cmd += util.format(' "%s" id=%s env=%s startMode=%s', app.main, server.id, app.env, app.startMode);
        sshrun(cmd, server.host, cb);
    }
};

function sshrun(cmd: string, host: string, cb?: Function) {
    let args = [];
    args.push(host);
    let ssh_params = app.someconfig.ssh;
    if (!!ssh_params && Array.isArray(ssh_params)) {
        args = args.concat(ssh_params);
    }
    args.push(cmd);
    spawnProcess("ssh", host, args, cb);
};

function localrun(cmd: string, host: string, options: string[], callback?: Function) {
    spawnProcess(cmd, host, options, callback);
};

function spawnProcess(command: string, host: string, options: string[], cb?: Function) {
    let child = null;

    if (app.isDaemon) {
        child = cp.spawn(command, options, { detached: true, stdio: 'ignore' });
        child.unref();
    } else {
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
};

let isLocal = function (host: string) {
    return host === '127.0.0.1' || host === 'localhost' || host === '0.0.0.0' || inLocal(host);
};

let inLocal = function (host: string) {
    return localIps.indexOf(host) !== -1;
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
