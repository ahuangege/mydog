#!/usr/bin/env node
"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
var path = __importStar(require("path"));
var fs = __importStar(require("fs"));
var child_process_1 = require("child_process");
var define = __importStar(require("./util/define"));
var msgCoder = __importStar(require("./components/msgCoder"));
var program = require("commander");
var tcpClient_1 = require("./components/tcpClient");
var version = require('../package.json').version;
var DEFAULT_MASTER_HOST = '127.0.0.1';
var DEFAULT_MASTER_PORT = 3005;
var FILEREAD_ERROR = 'Fail to read the file, please check if the application is started legally.';
var clientProxy = /** @class */ (function () {
    function clientProxy(host, port, token, cb) {
        var _this = this;
        this.reqId = 1;
        this.reqs = {};
        this.token = token;
        this.connect_cb = cb;
        this.socket = new tcpClient_1.TcpClient(port, host, this.connectCb.bind(this));
        this.socket.on("data", function (buf) {
            var data = JSON.parse(buf.toString());
            var reqId = data.reqId;
            var req = _this.reqs[reqId];
            if (!req) {
                return;
            }
            delete _this.reqs[reqId];
            clearTimeout(req.timeOut);
            req.cb(null, data.msg);
        });
        this.socket.on("close", function (err) {
            abort(err);
        });
    }
    clientProxy.prototype.connectCb = function () {
        // 注册
        var loginInfo = {
            T: 1 /* register */,
            clientToken: this.token
        };
        var loginInfo_buf = msgCoder.encodeInnerData(loginInfo);
        this.socket.send(loginInfo_buf);
        this.heartbeat();
        this.connect_cb(this);
    };
    clientProxy.prototype.heartbeat = function () {
        var self = this;
        setTimeout(function () {
            var heartBeatMsg = { T: 2 /* heartbeat */ };
            var heartBeatMsg_buf = msgCoder.encodeInnerData(heartBeatMsg);
            self.socket.send(heartBeatMsg_buf);
            self.heartbeat();
        }, define.some_config.Time.Monitor_Heart_Beat_Time * 1000);
    };
    clientProxy.prototype.request = function (msg, cb) {
        var reqId = this.reqId++;
        var data = { "T": 3 /* cliMsg */, "reqId": reqId, "msg": msg };
        var buf = msgCoder.encodeInnerData(data);
        this.socket.send(buf);
        var self = this;
        this.reqs[reqId] = {
            "cb": cb,
            "timeOut": setTimeout(function () {
                delete self.reqs[reqId];
                cb("time out");
            }, 10 * 1000)
        };
    };
    clientProxy.prototype.close = function () {
        abort();
    };
    return clientProxy;
}());
program.version(version);
program.command('init')
    .description('create a new application')
    .action(function () {
    init();
});
program.command('start')
    .description('start the application')
    .option('-p, --pro', 'enable production environment')
    .action(function (opts) {
    start(opts);
});
program.command('list')
    .description('list the servers')
    .option('-h, --host <master-host>', 'master server host', DEFAULT_MASTER_HOST)
    .option('-p, --port <master-port>', 'master server port', DEFAULT_MASTER_PORT)
    .option('-t, --token <master-client-token>', 'master server client token', define.some_config.Master_Client_Token)
    .action(function (opts) {
    list(opts);
});
program.command('stop')
    .description('stop the servers')
    .option('-h, --host <master-host>', 'master server host', DEFAULT_MASTER_HOST)
    .option('-p, --port <master-port>', 'master server port', DEFAULT_MASTER_PORT)
    .option('-t, --token <master-client-token>', 'master server client token', define.some_config.Master_Client_Token)
    .action(function (opts) {
    stop(opts);
});
program.command('remove')
    .description('remove some servers')
    .option('-h, --host <master-host>', 'master server host', DEFAULT_MASTER_HOST)
    .option('-p, --port <master-port>', 'master server port', DEFAULT_MASTER_PORT)
    .option('-t, --token <master-client-token>', 'master server client token', define.some_config.Master_Client_Token)
    .action(function (opts) {
    var args = [].slice.call(arguments, 0);
    opts = args[args.length - 1];
    opts.serverIds = args.slice(0, -1);
    remove(opts);
});
program.command('*')
    .action(function () {
    console.log('Illegal command format. Use `mydog --help` to get more info.\n');
});
program.parse(process.argv);
function init() {
    var path = process.cwd();
    emptyDirectory(path, function (empty) {
        if (empty) {
            process.stdin.destroy();
            createApplicationAt(path);
        }
        else {
            confirm('Destination is not empty, continue? (y/n) [no] ', function (force) {
                process.stdin.destroy();
                if (force) {
                    createApplicationAt(path);
                }
                else {
                    abort('Fail to init a project');
                }
            });
        }
    });
}
function createApplicationAt(ph) {
    copy(path.join(__dirname, '../template/ts'), ph);
    copy(path.join(__dirname, '../template/client'), ph);
}
function emptyDirectory(path, fn) {
    fs.readdir(path, function (err, files) {
        if (err && 'ENOENT' !== err.code) {
            abort(FILEREAD_ERROR);
        }
        fn(!files || !files.length);
    });
}
function confirm(msg, fn) {
    prompt(msg, function (val) {
        fn(/^ *y(es)?/i.test(val));
    });
}
function prompt(msg, fn) {
    if (' ' === msg[msg.length - 1]) {
        process.stdout.write(msg);
    }
    else {
        console.log(msg);
    }
    process.stdin.setEncoding('ascii');
    process.stdin.once('data', function (data) {
        fn(data);
    }).resume();
}
function abort(str) {
    if (str === void 0) { str = ""; }
    console.error(str);
    process.exit(1);
}
function copy(origin, target) {
    if (!fs.existsSync(origin)) {
        abort(origin + 'does not exist.');
    }
    if (!fs.existsSync(target)) {
        fs.mkdirSync(target);
        console.log('   create :  ' + target);
    }
    fs.readdir(origin, function (err, datalist) {
        if (err) {
            abort(FILEREAD_ERROR);
        }
        for (var i = 0; i < datalist.length; i++) {
            var oCurrent = path.resolve(origin, datalist[i]);
            var tCurrent = path.resolve(target, datalist[i]);
            if (fs.statSync(oCurrent).isFile()) {
                fs.writeFileSync(tCurrent, fs.readFileSync(oCurrent, ''), '');
                console.log('   create :  ' + tCurrent);
            }
            else if (fs.statSync(oCurrent).isDirectory()) {
                copy(oCurrent, tCurrent);
            }
        }
    });
}
function start(opts) {
    var absScript = path.resolve(process.cwd(), 'app.js');
    if (!fs.existsSync(absScript)) {
        abort("  ->  Not find the script: " + absScript);
    }
    opts.env = opts.pro ? "production" : "development";
    var ls;
    var params = [absScript, 'env=' + opts.env];
    if (opts.env === "production") {
        ls = child_process_1.spawn(process.execPath, params, { detached: true, stdio: 'ignore' });
        ls.unref();
        process.exit(0);
    }
    else {
        ls = child_process_1.spawn(process.execPath, params);
        ls.stdout.on('data', function (data) {
            console.log(data.toString());
        });
        ls.stderr.on('data', function (data) {
            console.log(data.toString());
        });
    }
}
function list(opts) {
    connectToMaster(opts.host, opts.port, opts.token, function (client) {
        client.request({ "func": "list" }, function (err, servers) {
            if (err) {
                return abort(err);
            }
            var serverTypes = {};
            var server;
            for (var i = 0; i < servers.length; i++) {
                server = servers[i];
                server.time = formatTime(server.time);
                serverTypes[server.serverType] = serverTypes[server.serverType] || [];
                serverTypes[server.serverType].push(server);
            }
            for (var x in serverTypes) {
                serverTypes[x].sort(comparer);
            }
            var endArr = [];
            endArr.push(["id", "serverType", "pid", "rss(M)", "heapTotal(M)", "heapUsed(M)", "upTime(d/h/m)"]);
            if (serverTypes["master"]) {
                pushArr(endArr, serverTypes["master"]);
                delete serverTypes["master"];
            }
            if (serverTypes["rpc"]) {
                pushArr(endArr, serverTypes["rpc"]);
                delete serverTypes["rpc"];
            }
            for (x in serverTypes) {
                pushArr(endArr, serverTypes[x]);
            }
            formatPrint(endArr);
            abort("");
        });
    });
    function formatTime(time) {
        time = Math.floor((Date.now() - time) / 1000);
        var days = Math.floor(time / (24 * 3600));
        time = time % (24 * 3600);
        var hours = Math.floor(time / 3600);
        time = time % 3600;
        var minutes = Math.ceil(time / 60);
        return days + "/" + hours + "/" + minutes;
    }
    var comparer = function (a, b) {
        if (a.id < b.id) {
            return -1;
        }
        else if (a.id > b.id) {
            return 1;
        }
        else {
            return 0;
        }
    };
    function pushArr(endArr, arr) {
        for (var i = 0; i < arr.length; i++) {
            endArr.push([arr[i].id, arr[i].serverType, arr[i].pid, arr[i].rss, arr[i].heapTotal, arr[i].heapUsed, arr[i].time]);
        }
    }
}
function stop(opts) {
    connectToMaster(opts.host, opts.port, opts.token, function (client) {
        client.request({ "func": "stop" }, function (err) {
            if (err) {
                return abort(err);
            }
            abort("the application has stopped, please confirm!");
        });
    });
}
function remove(opts) {
    if (opts.serverIds.length === 0) {
        return abort("no server input, please use `mydog remove server-id-1 server-id-2` ");
    }
    connectToMaster(opts.host, opts.port, opts.token, function (client) {
        client.request({ "func": "remove", "args": opts.serverIds }, function (err) {
            if (err) {
                return abort(err);
            }
            abort("the servers have been removed, please confirm!");
        });
    });
}
function formatPrint(strs) {
    var i, j;
    for (i = 0; i < strs.length; i++) {
        for (j = 0; j < strs[0].length; j++) {
            strs[i][j] = (strs[i][j] || "").toString();
        }
    }
    var lens = [];
    for (i = 0; i < strs[0].length; i++) {
        lens[i] = strs[0][i].length;
    }
    for (i = 1; i < strs.length; i++) {
        for (j = 0; j < strs[0].length; j++) {
            lens[j] = strs[i][j].length > lens[j] ? strs[i][j].length : lens[j];
        }
    }
    for (i = 0; i < lens.length - 1; i++) {
        lens[i] = lens[i] + 3;
    }
    for (i = 0; i < strs.length; i++) {
        for (j = 0; j < lens.length; j++) {
            strs[i][j] = formatStrLen(strs[i][j], lens[j]);
        }
    }
    console.log("");
    for (i = 0; i < strs.length; i++) {
        var tmpStr = "  " + (strs[i].slice(0, lens.length)).join("");
        console.log(tmpStr);
    }
    console.log("");
    function formatStrLen(str, len) {
        var add = len - str.length;
        for (var i = 0; i < add; i++) {
            str += " ";
        }
        return str;
    }
}
function connectToMaster(host, port, token, cb) {
    console.log("try to connect  " + host + ":" + port);
    var client = new clientProxy(host, port, token, cb);
}
