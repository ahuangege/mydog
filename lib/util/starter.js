var cp = require('child_process');
var starter = module.exports;
var util = require('util');
var env = "";
var os = require('os');


starter.runServers = function (app) {
    var servers = app.serversConfig;
    var serverTypes;
    var server;
    for (var serverType in servers) {
        serverTypes = servers[serverType];
        for (var i = 0; i < serverTypes.length; i++) {
            server = serverTypes[i];
            server.serverType = serverType;
            this.run(app, server);
        }
    }
    servers = app.rpcServersConfig;
    for (var i = 0; i < servers.length; i++) {
        server = servers[i];
        server.serverType = "rpc";
        this.run(app, server);
    }

};

starter.run = function (app, server, cb) {
    env = app.env;
    var cmd, key;
    if (isLocal(server.host)) {
        var options = [];
        cmd = app.main;
        options.push(cmd);
        options.push(util.format('env=%s', env));
        for (key in server) {
            options.push(util.format('%s=%s', key, server[key]));
        }
        options.push(util.format('%s=%s', "startMode", app.startMode));
        starter.localrun(process.execPath, null, options, cb);
    } else {
        cmd = util.format('cd "%s" && "%s"', app.getBase(), process.execPath);
        cmd += util.format(' "%s" env=%s ', app.main, env);
        for (key in server) {
            cmd += util.format(' %s=%s ', key, server[key]);
        }
        starter.sshrun(cmd, server.host, cb);
    }
};

starter.sshrun = function (cmd, host, cb) {
    var args = [];
    args.push(host);
    args.push(cmd);

    // console.log('Executing ' + cmd + ' on ' + host + ':22');
    spawnProcess("ssh", host, args, cb);
};

starter.localrun = function (cmd, host, options, callback) {
    // console.log('Executing ' + cmd + ' ' + options + ' locally');
    spawnProcess(cmd, host, options, callback);
};

var spawnProcess = function (command, host, options, cb) {
    var child = null;

    if (env === "development") {
        child = cp.spawn(command, options);
        var prefix = command === "ssh" ? '[' + host + '] ' : '';

        child.stderr.on('data', function (chunk) {
            var msg = chunk.toString();
            process.stderr.write(msg);
            if (!!cb) {
                cb(msg);
            }
        });

        child.stdout.on('data', function (chunk) {
            var msg = prefix + chunk.toString();
            process.stdout.write(msg);
        });
    } else {
        child = cp.spawn(command, options, {detached: true, stdio: 'inherit'});
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
