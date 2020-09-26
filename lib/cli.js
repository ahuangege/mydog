#!/usr/bin/env node
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
var path = __importStar(require("path"));
var fs = __importStar(require("fs"));
var readline = __importStar(require("readline"));
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
        this.socket = new tcpClient_1.TcpClient(port, host, define.some_config.SocketBufferMaxLen, true, this.connectCb.bind(this));
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
            cliToken: this.token
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
    .option('-e, --env <environment>', 'the used environment', "development")
    .option('-d, --daemon', 'enable the daemon start')
    .action(function (opts) {
    var args = [].slice.call(arguments, 0);
    opts = args[args.length - 1];
    opts.serverIds = args.slice(0, -1);
    start(opts);
});
program.command('list')
    .description('list the servers')
    .option('-h, --host <master-host>', 'master server host', DEFAULT_MASTER_HOST)
    .option('-p, --port <master-port>', 'master server port', DEFAULT_MASTER_PORT)
    .option('-t, --token <cli-token>', 'cli token', define.some_config.Cli_Token)
    .option('-i, --interval <request-interval>', 'request-interval')
    .action(function (opts) {
    list(opts);
});
program.command('stop')
    .description('stop the servers')
    .option('-h, --host <master-host>', 'master server host', DEFAULT_MASTER_HOST)
    .option('-p, --port <master-port>', 'master server port', DEFAULT_MASTER_PORT)
    .option('-t, --token <cli-token>', 'cli token', define.some_config.Cli_Token)
    .action(function (opts) {
    stop(opts);
});
program.command('remove')
    .description('remove some servers')
    .option('-h, --host <master-host>', 'master server host', DEFAULT_MASTER_HOST)
    .option('-p, --port <master-port>', 'master server port', DEFAULT_MASTER_PORT)
    .option('-t, --token <cli-token>', ' cli token', define.some_config.Cli_Token)
    .action(function (opts) {
    var args = [].slice.call(arguments, 0);
    opts = args[args.length - 1];
    opts.serverIds = args.slice(0, -1);
    remove(opts);
});
program.command('removeT')
    .description('remove some serverTypes')
    .option('-h, --host <master-host>', 'master server host', DEFAULT_MASTER_HOST)
    .option('-p, --port <master-port>', 'master server port', DEFAULT_MASTER_PORT)
    .option('-t, --token <cli-token>', ' cli token', define.some_config.Cli_Token)
    .action(function (opts) {
    var args = [].slice.call(arguments, 0);
    opts = args[args.length - 1];
    opts.serverTypes = args.slice(0, -1);
    removeT(opts);
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
    copy(path.join(__dirname, '../template'), ph);
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
        fn(data.toString());
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
    opts.env = opts.env || "development";
    opts.daemon = !!opts.daemon;
    if (opts.serverIds.length === 0) {
        startSvr([absScript, 'env=' + opts.env, "daemon=" + opts.daemon]);
    }
    else {
        for (var _i = 0, _a = opts.serverIds; _i < _a.length; _i++) {
            var one = _a[_i];
            startSvr([absScript, 'env=' + opts.env, "daemon=" + opts.daemon, "id=" + one]);
        }
    }
    if (opts.daemon) {
        console.log('The application is running in the background now.\n');
        process.exit(0);
    }
    function startSvr(params) {
        var ls;
        if (opts.daemon) {
            ls = child_process_1.spawn(process.execPath, params, { detached: true, stdio: 'ignore' });
            ls.unref();
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
}
function list(opts) {
    var interval = Number(opts.interval) || 5;
    if (interval < 1) {
        interval = 1;
    }
    connectToMaster(opts.host, opts.port, opts.token, function (client) {
        console.log("\n");
        requestList();
        var rowNum = 0;
        function requestList() {
            client.request({ "func": "list" }, function (err, msg) {
                if (err) {
                    return abort(err);
                }
                var titles = msg.infoArr.shift();
                titles.splice(1, 1);
                var serverTypes = {};
                for (var _i = 0, _a = msg.serverTypeSort; _i < _a.length; _i++) {
                    var one = _a[_i];
                    serverTypes[one] = [];
                }
                for (var _b = 0, _c = msg.infoArr; _b < _c.length; _b++) {
                    var one = _c[_b];
                    serverTypes[one[1]].push(one);
                    one.splice(1, 1);
                }
                for (var x in serverTypes) {
                    serverTypes[x].sort(comparer);
                }
                var id = 1;
                titles.unshift("");
                var endArr = [];
                endArr.push(titles);
                serverTypes["master"][0].unshift(" " + id.toString());
                id++;
                endArr.push(serverTypes["master"][0]);
                delete serverTypes["master"];
                for (var x in serverTypes) {
                    for (var _d = 0, _e = serverTypes[x]; _d < _e.length; _d++) {
                        var one = _e[_d];
                        one.unshift(" " + id.toString());
                        id++;
                        endArr.push(one);
                    }
                }
                readline.cursorTo(process.stdout, 0);
                readline.moveCursor(process.stdout, 0, -rowNum);
                readline.clearScreenDown(process.stdout);
                rowNum = endArr.length + 1;
                mydogListPrint(msg.name, msg.env, endArr);
                setTimeout(requestList, interval * 1000);
            });
        }
    });
    var comparer = function (a, b) {
        if (a[0] < b[0]) {
            return -1;
        }
        else {
            return 1;
        }
    };
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
function removeT(opts) {
    if (opts.serverTypes.length === 0) {
        return abort("no serverType input, please use `mydog removeT gate connector` ");
    }
    connectToMaster(opts.host, opts.port, opts.token, function (client) {
        client.request({ "func": "removeT", "args": opts.serverTypes }, function (err) {
            if (err) {
                return abort(err);
            }
            abort("the serverTypes have been removed, please confirm!");
        });
    });
}
function mydogListPrint(appName, env, infoArr) {
    var consoleMaxColumns = process.stdout.columns - 2;
    var nameEnv = "  appName: " + appName + "    env: " + env;
    console.log("\x1b[32m" + getRealStr(nameEnv) + "\x1b[0m");
    var widthArr = []; // 每个字段的控制台宽度
    var columnWidth = []; // 每列的最大宽度
    var titleLen = infoArr[0].length;
    for (var i = 0; i < titleLen; i++) {
        columnWidth.push(0);
    }
    for (var i = 0; i < infoArr.length; i++) {
        var one = infoArr[i];
        if (one.length > titleLen) {
            one.splice(titleLen);
        }
        else if (one.length < titleLen) {
            for (var j = titleLen - one.length - 1; j >= 0; j--) {
                one.push("");
            }
        }
        var tmpArr = [];
        for (var j = 0; j < titleLen; j++) {
            one[j] = one[j].toString();
            var tmpLen = getDisplayLength(one[j]);
            tmpArr.push(tmpLen);
            if (tmpLen > columnWidth[j]) {
                columnWidth[j] = tmpLen;
            }
        }
        widthArr[i] = tmpArr;
    }
    for (var i = 0; i < titleLen; i++) {
        columnWidth[i] += 3;
    }
    for (var i = 0; i < infoArr.length; i++) {
        var one = infoArr[i];
        var tmpWidthArr = widthArr[i];
        for (var j = 0; j < titleLen; j++) {
            one[j] += " ".repeat(columnWidth[j] - tmpWidthArr[j]);
        }
        if (i === 0) {
            console.log("\x1b[31m" + getRealStr(one.join("")) + "\x1b[0m");
        }
        else {
            console.log(getRealStr(one.join("")));
        }
    }
    function getRealStr(str) {
        while (getDisplayLength(str) > consoleMaxColumns) {
            str = str.substring(0, str.length - 2);
        }
        return str;
    }
    //获得字符串实际长度，中文2，英文1
    //控制台中中文占用2个英文字符的宽度
    function getDisplayLength(str) {
        var realLength = 0, len = str.length, charCode = -1;
        for (var i = 0; i < len; i++) {
            charCode = str.charCodeAt(i);
            if (charCode >= 0 && charCode <= 128) {
                realLength += 1;
            }
            else {
                realLength += 2;
            }
        }
        return realLength;
    }
}
function connectToMaster(host, port, token, cb) {
    console.log("try to connect  " + host + ":" + port);
    var client = new clientProxy(host, port, token, cb);
}
