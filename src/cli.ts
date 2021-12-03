#!/usr/bin/env node

import * as path from "path";
import * as fs from "fs";
import * as readline from "readline";
import { spawn } from "child_process";
import * as define from "./util/define";
import * as msgCoder from "./components/msgCoder";
import { TcpClient } from "./components/tcpClient";

let version = require('../package.json').version;
let DEFAULT_MASTER_HOST = '127.0.0.1';
let DEFAULT_MASTER_PORT = 3005;
let FILEREAD_ERROR = 'Fail to read the file, please check if the application is started legally.';


class clientProxy {
    reqId: number = 1;
    reqs: { [reqId: number]: { "cb": Function, "timeOut": NodeJS.Timer } } = {};
    socket: TcpClient;
    token: string;
    connect_cb: Function;
    private needAbort = true;
    private heartbeatTimeout: NodeJS.Timeout = null as any;
    constructor(host: string, port: number, token: string, cb: Function) {
        this.token = token;
        this.connect_cb = cb;
        this.socket = new TcpClient(port, host, define.some_config.SocketBufferMaxLen, true, this.connectCb.bind(this));

        this.socket.on("data", (buf: Buffer) => {
            let data = JSON.parse(buf.toString());
            let reqId = data.reqId;
            let req = this.reqs[reqId];
            if (!req) {
                return;
            }
            delete this.reqs[reqId];
            clearTimeout(req.timeOut);
            req.cb(null, data.msg);
        });

        this.socket.on("close", (err: any) => {
            clearTimeout(this.heartbeatTimeout);
            if (this.needAbort) {
                abort(err);
            }
        });
    }

    private connectCb() {
        // register
        let loginInfo = {
            T: define.Cli_To_Master.register,
            cliToken: this.token
        };
        let loginInfo_buf = msgCoder.encodeInnerData(loginInfo);
        this.socket.send(loginInfo_buf);
        this.heartbeat();
        this.connect_cb(this);
    }

    private heartbeat() {
        let self = this;
        this.heartbeatTimeout = setTimeout(function () {
            let heartBeatMsg = { T: define.Cli_To_Master.heartbeat };
            let heartBeatMsg_buf = msgCoder.encodeInnerData(heartBeatMsg);
            self.socket.send(heartBeatMsg_buf);
            self.heartbeat();
        }, define.some_config.Time.Monitor_Heart_Beat_Time * 1000)
    }

    request(msg: any, timeout: number, cb: (err: string, ...args: any[]) => void) {
        let reqId = this.reqId++;
        let data = { "T": define.Cli_To_Master.cliMsg, "reqId": reqId, "msg": msg };
        let buf = msgCoder.encodeInnerData(data);
        this.socket.send(buf);

        let self = this;
        this.reqs[reqId] = {
            "cb": cb,
            "timeOut": setTimeout(function () {
                delete self.reqs[reqId];
                cb("time out");
            }, timeout * 1000)
        };

    }

    close(needAbort = true) {
        this.needAbort = needAbort;
        this.socket.close();
    }
}


class Commond {
    private baseName: string = "";
    private ver: string = "";
    private cmdArr: I_commond[] = [];
    setNameVersion(baseName: string, ver: string) {
        this.baseName = baseName;
        this.ver = ver;
    }
    addCommond(cmd: I_commond) {
        for (let one of this.cmdArr) {
            if (one.name === cmd.name) {
                console.log(`\n   Error: [Cmd already exists] cmd -> ${cmd.name}\n`);
                process.exit();
            }
        }
        for (let i = 0; i < cmd.options.length; i++) {
            let one = cmd.options[i];
            for (let j = i + 1; j < cmd.options.length; j++) {
                let two = cmd.options[j];
                if (two.opt === one.opt) {
                    console.log(`\n   Error: [Option.opt already exists] cmd -> ${cmd.name}, opt -> ${one.opt}\n`);
                    process.exit();
                }
                if (two.name === one.name) {
                    console.log(`\n   Error: [Option.name already exists] cmd -> ${cmd.name}, name -> ${one.name}\n`);
                    process.exit();
                }
            }
        }
        this.cmdArr.push(cmd);
    }

    parse() {
        let argvArr = [...process.argv];
        argvArr.splice(0, 2);
        if (!argvArr.length) {
            this.print_help();
            return;
        }
        let cmdName = argvArr[0];
        if (["-h", "-H", "--help"].includes(cmdName)) {
            this.print_help();
            return;
        }
        if (["-v", "-V", "--version"].includes(cmdName)) {
            console.log(`\n   Version: ${this.ver}\n`);
            return;
        }
        if (cmdName === "des") {
            this.print_des(argvArr[1]);
            return;
        }
        this.parseCmd(cmdName, argvArr);
    }

    private parseCmd(cmdName: string, argvArr: string[]) {
        let cmd: I_commond = null as any;
        for (let one of this.cmdArr) {
            if (one.name === cmdName) {
                cmd = one;
                break;
            }
        }
        if (!cmd) {
            console.log(`\n   Error: [Cmd not exists] ${cmdName}\n`);
            return;
        }
        if (argvArr.includes("--help")) {
            this.print_des(cmdName);
            return;
        }
        let keyDic: { [key: string]: any } = {};
        let otherArr: string[] = [];
        for (let i = 1; i < argvArr.length;) {
            let str = argvArr[i];
            if (!str.startsWith("-")) {
                otherArr.push(str);
                i += 1;
                continue;
            }
            let option: I_option = null as any;
            for (let one of cmd.options) {
                if (one.opt === str) {
                    option = one;
                    break;
                }
            }
            if (!option) {
                console.log(`\n   Error: [No such option] ${str}\n`);
                process.exit();
            }
            if (option.type === "bool") {
                keyDic[option.name] = true;
                i += 1;
                continue;
            }
            if (option.type === "string") {
                let str2 = argvArr[i + 1];
                if (!str2 || str2.startsWith("-")) {
                    console.log(`\n   Error: [Wrong option input] ${str} ${str2 || ""}\n`);
                    process.exit();
                }
                keyDic[option.name] = str2;
                i += 2;
                continue;
            }
            if (option.type === "number") {
                let str2 = argvArr[i + 1];
                if (!str2 || str2.startsWith("-")) {
                    console.log(`\n   Error: [Wrong option input] ${str} ${str2 || ""}\n`);
                    process.exit();
                }
                let numVal = Number(str2);
                if (isNaN(numVal)) {
                    console.log(`\n   Error: [Wrong option input] ${str} ${str2 || ""}\n`);
                    process.exit();
                }
                keyDic[option.name] = numVal;
                i += 2;
                continue;
            }
        }

        for (let one of cmd.options) {
            if (keyDic[one.name] !== undefined) {
                continue;
            }
            if (one.type === "bool") {
                continue;
            }
            if (one.mustNeed) {
                console.log(`\n   Error: [Need option] ${one.opt}\n`);
                process.exit();
            } else if (one.default !== undefined) {
                keyDic[one.name] = one.default;
            }
        }
        cmd.cb(keyDic, otherArr);
    }

    private print_help() {
        console.log("");
        console.log(` Version: ${this.ver}`);
        console.log(" Usage:")
        let defaultArr: string[][] = [];
        defaultArr.push(["-v", "show the version"]);
        defaultArr.push(["-h", "list the commonds"]);
        defaultArr.push(["des [command]", "describe the command"]);
        this.printArr(defaultArr);

        console.log("\n Commands:");
        let arr: string[][] = [];
        for (let one of this.cmdArr) {
            arr.push([one.name + (one.options.length ? " [options]" : ""), one.des]);
        }
        this.printArr(arr);
        console.log("");
    }

    private print_des(cmdName: string) {
        let cmd: I_commond = null as any;
        for (let one of this.cmdArr) {
            if (one.name === cmdName) {
                cmd = one;
                break;
            }
        }
        if (!cmd) {
            console.log(`\n   Error: [Cmd not exists] cmd -> ${cmdName}\n`);
            return;
        }
        console.log(``);
        console.log(` Cmd: ${this.baseName} ${cmd.name}`);
        console.log(` Des: ${cmd.des}`);
        if (cmd.usage) {
            console.log(` Usage: ${cmd.usage}`);
        }
        console.log(` Options:`);

        let arr: string[][] = [];
        for (let one of cmd.options) {
            let tmpDes = one.des;
            if (!one.mustNeed && one.type !== "bool" && one.default !== undefined) {
                if (one.type === "string") {
                    tmpDes += ` (default: "${one.default}")`;
                } else {
                    tmpDes += ` (default: ${one.default})`;
                }
            }
            arr.push([one.opt, one.type === "bool" ? "" : `${one.name} [${one.type}]`, tmpDes, one.mustNeed ? "√" : ""])
        }
        this.printArr(arr);
        console.log("");
    }


    private printArr(arr: string[][]) {
        let widthArr: number[][] = [];
        let maxWidthArr: number[] = [];
        for (let i = 0; i < arr.length; i++) {
            let one = arr[i];
            let tmpArr: number[] = [];
            for (let j = 0; j < one.length; j++) {
                let len = this.getDisplayLength(one[j]);
                tmpArr.push(len);
                if (len >= (maxWidthArr[j] || 0)) {
                    maxWidthArr[j] = len;
                }
            }
            widthArr.push(tmpArr);
        }
        for (let i = 0; i < maxWidthArr.length; i++) {
            maxWidthArr[i] += 5;
        }
        for (let i = 0; i < arr.length; i++) {
            for (let j = 0; j < arr[i].length; j++) {
                arr[i][j] += " ".repeat(maxWidthArr[j] - widthArr[i][j]);
            }
            console.log("   ", arr[i].join(""));
        }

    }

    private getDisplayLength(str: string) {
        let realLength = 0, len = str.length, charCode = -1;
        for (var i = 0; i < len; i++) {
            charCode = str.charCodeAt(i);
            if (charCode >= 0 && charCode <= 128) {
                realLength += 1;
            } else {
                realLength += 2;
            }

        }
        return realLength;
    }
}


interface I_commond {
    /** 名称 */
    "name": string,
    /** 描述 */
    "des": string,
    /** 选项 */
    "options": I_option[],
    /** 使用示例 */
    "usage": string,
    /** 回调 */
    "cb": (opts: any, argv: string[]) => void
}

interface I_option {
    /** 关键值（必须以"-"开头） */
    "opt": string,
    /** 名字 */
    "name": string,
    /** 描述 */
    "des": string,
    /** 是否是必选项 */
    "mustNeed": boolean,
    /** 类型 */
    "type": "bool" | "string" | "number"
    /** 默认值 */
    "default"?: number | string,
}

let commond = new Commond();
commond.setNameVersion("mydog", version);

commond.addCommond({
    "name": "init",
    "des": "create a new application",
    "options": [],
    "usage": "",
    "cb": () => {
        init();
    }
});

commond.addCommond({
    "name": "start",
    "des": "start the application",
    "options": [
        { "opt": "-e", "name": "env", "des": "the used environment", "mustNeed": false, "type": "string", "default": "development" },
        { "opt": "-d", "name": "daemon", "des": "enable the daemon start", "mustNeed": false, "type": "bool" },
    ],
    "usage": "mydog start -e env [serverId-1 ...]",
    "cb": (opts: { "env": string, "daemon": boolean, "serverIds": string[] }, argv) => {
        opts.serverIds = argv;
        start(opts);
    }
});

commond.addCommond({
    "name": "list",
    "des": "list the servers",
    "options": [
        { "opt": "-h", "name": "host", "des": "master server host", "mustNeed": false, "type": "string", "default": DEFAULT_MASTER_HOST },
        { "opt": "-p", "name": "port", "des": "master server port", "mustNeed": false, "type": "number", "default": DEFAULT_MASTER_PORT },
        { "opt": "-t", "name": "token", "des": "cli token", "mustNeed": false, "type": "string", "default": define.some_config.Cli_Token },
        { "opt": "-i", "name": "interval", "des": "request interval", "mustNeed": false, "type": "number", "default": 5 },
    ],
    "usage": "",
    "cb": (opts: { "host": string, "port": number, "token": string, "interval": number }) => {
        list(opts);
    }
});

commond.addCommond({
    "name": "stop",
    "des": "stop the servers",
    "options": [
        { "opt": "-h", "name": "host", "des": "master server host", "mustNeed": false, "type": "string", "default": DEFAULT_MASTER_HOST },
        { "opt": "-p", "name": "port", "des": "master server port", "mustNeed": false, "type": "number", "default": DEFAULT_MASTER_PORT },
        { "opt": "-t", "name": "token", "des": "cli token", "mustNeed": false, "type": "string", "default": define.some_config.Cli_Token },
    ],
    "usage": "",
    "cb": (opts: { "host": string, "port": number, "token": string }) => {
        stop(opts);
    }
});

commond.addCommond({
    "name": "remove",
    "des": "remove some servers",
    "options": [
        { "opt": "-h", "name": "host", "des": "master server host", "mustNeed": false, "type": "string", "default": DEFAULT_MASTER_HOST },
        { "opt": "-p", "name": "port", "des": "master server port", "mustNeed": false, "type": "number", "default": DEFAULT_MASTER_PORT },
        { "opt": "-t", "name": "token", "des": "cli token", "mustNeed": false, "type": "string", "default": define.some_config.Cli_Token },
    ],
    "usage": "mydog remove serverId-1 [serverId-2 ...]",
    "cb": (opts: { "host": string, "port": number, "token": string, "serverIds": string[] }, argv) => {
        opts.serverIds = argv;
        remove(opts);
    }
});

commond.addCommond({
    "name": "removeT",
    "des": "remove some serverTypes",
    "options": [
        { "opt": "-h", "name": "host", "des": "master server host", "mustNeed": false, "type": "string", "default": DEFAULT_MASTER_HOST },
        { "opt": "-p", "name": "port", "des": "master server port", "mustNeed": false, "type": "number", "default": DEFAULT_MASTER_PORT },
        { "opt": "-t", "name": "token", "des": "cli token", "mustNeed": false, "type": "string", "default": define.some_config.Cli_Token },
    ],
    "usage": "mydog removeT serverType-1 [serverType-2 ...]",
    "cb": (opts: { "host": string, "port": number, "token": string, "serverTypes": string[] }, argv) => {
        opts.serverTypes = argv;
        removeT(opts);
    }
});

commond.addCommond({
    "name": "cmd",
    "des": "build cmd file",
    "options": [],
    "usage": "mydog cmd [ts cs ...]",
    "cb": (opts, argv) => {
        cmd(argv);
    }
});

commond.addCommond({
    "name": "send",
    "des": "send msg to mydog",
    "options": [
        { "opt": "-h", "name": "host", "des": "master server host", "mustNeed": false, "type": "string", "default": DEFAULT_MASTER_HOST },
        { "opt": "-p", "name": "port", "des": "master server port", "mustNeed": false, "type": "number", "default": DEFAULT_MASTER_PORT },
        { "opt": "-t", "name": "token", "des": "cli token", "mustNeed": false, "type": "string", "default": define.some_config.Cli_Token },
        { "opt": "-id", "name": "serverId", "des": "serverId will get msg", "mustNeed": false, "type": "string" },
        { "opt": "-svrT", "name": "serverType", "des": "serverType will get msg", "mustNeed": false, "type": "string" },
    ],
    "usage": "mydog send [-id id1,id2] [-svrT svrT1,svrT2] [argv0 argv1...]",
    "cb": (opts: { "host": string, "port": number, "token": string, "serverId": string, "serverType": string }, argv) => {
        send(opts, argv);
    }
});


commond.parse();



function abort(str: string = "") {
    console.error(str);
    process.exit(1);
}


function init() {
    let pathStr = process.cwd();
    emptyDirectory(pathStr, function (empty) {
        if (empty) {
            createApplicationAt(pathStr);
        } else {
            confirm('Destination is not empty, continue? (y/n) [no]   ', function (force) {
                if (force) {
                    createApplicationAt(pathStr);
                } else {
                    abort('[ canceled ]');
                }
            });
        }
    });

    function createApplicationAt(ph: string) {
        copy(path.join(__dirname, '../template'), ph);

        function copy(origin: string, target: string) {
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
                for (let i = 0; i < datalist.length; i++) {
                    let oCurrent = path.resolve(origin, datalist[i]);
                    let tCurrent = path.resolve(target, datalist[i]);
                    if (fs.statSync(oCurrent).isFile()) {
                        fs.writeFileSync(tCurrent, fs.readFileSync(oCurrent, ''), '');
                        console.log('   create :  ' + tCurrent);
                    } else if (fs.statSync(oCurrent).isDirectory()) {
                        copy(oCurrent, tCurrent);
                    }
                }
            });
        }
    }

    function emptyDirectory(path: string, fn: (isEmpth: boolean) => void) {
        fs.readdir(path, function (err, files) {
            if (err && 'ENOENT' !== err.code) {
                abort(FILEREAD_ERROR);
            }
            fn(!files || !files.length);
        });
    }

}

function confirm(msg: string, fn: (yes: boolean) => void) {
    prompt(msg, function (val) {
        val = val.trim().toLowerCase();
        fn(val === "y" || val === "yes");
    });
    function prompt(msg: string, fn: (data: string) => void) {
        console.log(msg);
        process.stdin.setEncoding('ascii');
        process.stdin.once('data', function (data) {
            process.stdin.destroy();
            fn(data.toString());
        }).resume();
    }
}


function start(opts: { "env": string, "daemon": boolean, "serverIds": string[] }) {

    let absScript = path.resolve(process.cwd(), 'app.js');
    if (!fs.existsSync(absScript)) {
        abort("  ->  Not find the script: " + absScript);
    }
    opts.env = opts.env || "development";
    opts.daemon = !!opts.daemon;
    if (opts.serverIds.length === 0) {
        startSvr([absScript, 'env=' + opts.env, "daemon=" + opts.daemon]);
    } else {
        for (let one of opts.serverIds) {
            startSvr([absScript, 'env=' + opts.env, "daemon=" + opts.daemon, "id=" + one]);
        }
    }

    if (opts.daemon) {
        console.log('The application is running in the background now.\n');
        process.exit(0);
    }

    function startSvr(params: string[]) {
        let ls;
        if (opts.daemon) {
            ls = spawn(process.execPath, params, { detached: true, stdio: 'ignore' });
            ls.unref();
        } else {
            ls = spawn(process.execPath, params);
            ls.stdout.on('data', function (data) {
                console.log(data.toString());
            });
            ls.stderr.on('data', function (data) {
                console.log(data.toString());
            });
        }
    }

}

function list(opts: { "host": string, "port": number, "token": string, "interval": number }) {
    let interval = Math.ceil(opts.interval);
    if (interval < 1) {
        interval = 1;
    }
    connectToMaster(opts.host, opts.port, opts.token, function (client) {
        console.log("");
        requestList();
        let rowNum = 0;
        function requestList() {
            client.request({ "func": "list" }, 10, function (err, msg: { "name": string, "env": string, "serverTypeSort": string[], "infoArr": string[][] }) {
                if (err) {
                    return abort(err);
                }
                let titles = msg.infoArr.shift() as string[];
                titles.splice(1, 1);
                let serverTypes: { [svrType: string]: string[][] } = {};
                for (let one of msg.serverTypeSort) {
                    serverTypes[one] = [];
                }
                for (let one of msg.infoArr) {
                    serverTypes[one[1]].push(one);
                    one.splice(1, 1);
                }
                for (let x in serverTypes) {
                    serverTypes[x].sort(comparer);
                }
                let id = 1;
                titles.unshift("");
                let endArr: string[][] = [];
                endArr.push(titles);
                serverTypes["master"][0].unshift(" " + id.toString());
                id++;
                endArr.push(serverTypes["master"][0]);
                delete serverTypes["master"];

                for (let x in serverTypes) {
                    for (let one of serverTypes[x]) {
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
                setTimeout(requestList, interval * 1000)
            });
        }
    });

    let comparer = function (a: string[], b: string[]) {
        if (a[0] < b[0]) {
            return -1;
        } else {
            return 1;
        }
    };


    function mydogListPrint(appName: string, env: string, infoArr: string[][]) {
        let consoleMaxColumns = process.stdout.columns - 2;
        let nameEnv = "  appName: " + appName + "    env: " + env;
        console.log("\x1b[35m" + getRealStr(nameEnv) + "\x1b[0m");

        let widthArr: number[][] = [];
        let columnWidth: number[] = [];
        let titleLen = infoArr[0].length;
        for (let i = 0; i < titleLen; i++) {
            columnWidth.push(0);
        }
        for (let i = 0; i < infoArr.length; i++) {
            let one = infoArr[i];
            if (one.length > titleLen) {
                one.splice(titleLen);
            } else if (one.length < titleLen) {
                for (let j = titleLen - one.length - 1; j >= 0; j--) {
                    one.push("");
                }
            }
            let tmpArr: number[] = [];
            for (let j = 0; j < titleLen; j++) {
                one[j] = one[j].toString();
                let tmpLen = getDisplayLength(one[j]);
                tmpArr.push(tmpLen);
                if (tmpLen > columnWidth[j]) {
                    columnWidth[j] = tmpLen;
                }
            }
            widthArr[i] = tmpArr;
        }
        for (let i = 0; i < titleLen; i++) {
            columnWidth[i] += 3;
        }

        for (let i = 0; i < infoArr.length; i++) {
            let one = infoArr[i];
            let tmpWidthArr = widthArr[i];
            for (let j = 0; j < titleLen; j++) {
                one[j] += " ".repeat(columnWidth[j] - tmpWidthArr[j]);
            }
            if (i === 0) {
                console.log("\x1b[31m" + getRealStr(one.join("")) + "\x1b[0m");
            } else {
                console.log(getRealStr(one.join("")));
            }
        }



        function getRealStr(str: string) {
            while (getDisplayLength(str) > consoleMaxColumns) {
                str = str.substring(0, str.length - 2);
            }
            return str;
        }


        function getDisplayLength(str: string) {
            let realLength = 0, len = str.length, charCode = -1;
            for (var i = 0; i < len; i++) {
                charCode = str.charCodeAt(i);
                if (charCode >= 0 && charCode <= 128) {
                    realLength += 1;
                } else {
                    realLength += 2;
                }

            }
            return realLength;
        }

    }

}

function stop(opts: { "host": string, "port": number, "token": string }) {
    confirm('stop the server ? (y/n) [no]   ', (yes) => {
        if (!yes) {
            abort("[ canceled ]")
            return;
        }
        connectToMaster(opts.host, opts.port, opts.token, function (client) {
            client.request({ "func": "stop" }, 3600, function (err) {
                if (err) {
                    return abort(err);
                }
                abort("the application has stopped, please confirm!");
            });
        });
    })

}

function remove(opts: { "host": string, "port": number, "token": string, "serverIds": string[] }) {
    if (opts.serverIds.length === 0) {
        return abort("no server input, please use like `mydog remove serverId-1 [serverId-2 ...]` ")
    }
    confirm(`remove server: ${opts.serverIds.join(" ")} ? (y/n) [no]   `, (yes) => {
        if (!yes) {
            abort("[ canceled ]")
            return;
        }
        connectToMaster(opts.host, opts.port, opts.token, function (client) {
            client.request({ "func": "remove", "args": opts.serverIds }, 10, function (err) {
                if (err) {
                    return abort(err);
                }
                abort("the servers have been removed, please confirm!");
            });
        });
    });

}

function removeT(opts: { "host": string, "port": number, "token": string, "serverTypes": string[] }) {
    if (opts.serverTypes.length === 0) {
        return abort("no serverType input, please use like `mydog removeT serverType-1 [serverType-2 ...]` ")
    }
    confirm(`remove serverType: ${opts.serverTypes.join(" ")} ? (y/n) [no]   `, (yes) => {
        if (!yes) {
            abort("[ canceled ]")
            return;
        }
        connectToMaster(opts.host, opts.port, opts.token, function (client) {
            client.request({ "func": "removeT", "args": opts.serverTypes }, 10, function (err) {
                if (err) {
                    return abort(err);
                }
                abort("the serverTypes have been removed, please confirm!");
            });
        });
    });
}


function cmd(lans: string[]) {
    let routePath = "config/sys/route.ts";
    let serverPath = "config/cmd.ts";
    let nowPath = process.cwd();
    let filepath = path.join(nowPath, routePath);
    if (!fs.existsSync(filepath)) {
        abort("  ->  Not find the script: " + filepath);
    }
    let readStream = fs.createReadStream(filepath);
    let read_l = readline.createInterface({ "input": readStream });

    let hasStart = false;
    let cmdObjArr: { "cmd": string, "note": string }[] = [];

    read_l.on("line", function (line) {
        line = line.trim();
        if (line === "") {
            return;
        }
        if (!hasStart) {
            if (line.indexOf("export") === 0) hasStart = true;
            return;
        }
        if (line.indexOf("]") === 0) {
            serverCmd();
            clientCmd();
            read_l.close();
            return;
        }
        if (line.indexOf('"') !== 0) {
            return;
        }
        line = line.substring(1);
        let index = line.indexOf('"');
        if (index === -1) {
            return;
        }

        let cmd = line.substring(0, index);
        let note = "";
        index = line.indexOf("//");
        if (index !== -1) {
            note = line.substring(index + 2).trim();
        }
        cmdObjArr.push({ "cmd": cmd, "note": note });
    });

    read_l.on("close", function () {
        console.log("build cmd ok!");
    });


    function serverCmd() {
        let endStr = `export const enum cmd {\n`
        let index = 0;
        for (let one of cmdObjArr) {
            if (one.note) {
                endStr += `\t/**\n\t * ${one.note}\n\t */\n`;
            }
            let oneStr = one.cmd;
            if (one.cmd.indexOf('.') !== -1) {
                let tmpArr = one.cmd.split('.');
                oneStr = tmpArr[0] + '_' + tmpArr[1] + '_' + tmpArr[2];
            }
            endStr += `\t${oneStr} = ${index},\n`;
            index++;
        }
        endStr += '}';

        let csFilename = path.join(nowPath, serverPath);
        fs.writeFileSync(csFilename, endStr);
    }

    function clientCmd() {
        let clipath = path.join(nowPath, "mydog_cli.js");
        if (!fs.existsSync(clipath)) {
            return;
        }
        let file = require(path.join(nowPath, "mydog_cli.js"));
        if (file.mydog_cmd && typeof file.mydog_cmd === "function") {
            file.mydog_cmd(lans, cmdObjArr);
        }
    }

}

function send(opts: { "host": string, "port": number, "token": string, "serverId": string, "serverType": string }, argv: string[]) {
    if (argv.length === 0) {
        return abort("At least one argv is required");
    }
    let serverIds: string[] = [];
    let serverTypes: string[] = [];
    let endMsg: { "serverIds": string[], "serverTypes": string[], "argv": string[] } = {} as any;
    if (opts.serverId) {
        serverIds = opts.serverId.split(" ");
        endMsg["serverIds"] = serverIds;
    } else if (opts.serverType) {
        serverTypes = opts.serverType.split(" ");
        endMsg["serverTypes"] = serverTypes;
    }
    endMsg["argv"] = argv;
    let msg = `sendMsg:
{
    "serverIds": ${JSON.stringify(serverIds)}
    "serverTypes": ${JSON.stringify(serverTypes)}
    "argv": ${JSON.stringify(argv)}
}
(y/n)[no] ?    `
    confirm(msg, (yes) => {
        if (!yes) {
            abort("[ canceled ]")
            return;
        }
        connectToMaster(opts.host, opts.port, opts.token, function (client) {
            console.log();
            client.request({ "func": "send", "args": endMsg }, 60, function (err, data: { "err": string, "timeoutIds": string[], "data": any[] }) {
                client.close(false);
                if (err) {
                    return abort(err);
                }
                if (data.err) {
                    return abort(data.err);
                }
                let clipath = path.join(process.cwd(), "mydog_cli.js");
                if (!fs.existsSync(clipath)) {
                    console.log(data);
                    return;
                }
                let file = require(path.join(process.cwd(), "mydog_cli.js"));
                if (file.mydog_send && typeof file.mydog_send === "function") {
                    file.mydog_send(endMsg, data.timeoutIds, data.data);
                } else {
                    console.log(data);
                }
            });
        });
    });
}


function connectToMaster(host: string, port: number, token: string, cb: (client: clientProxy) => void) {
    console.log("try to connect  " + host + ":" + port);
    let client = new clientProxy(host, port, token, cb);
}