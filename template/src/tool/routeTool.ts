let routePath = "../config/sys/route.ts";
let serverPath = "../config/cmd.ts";
let clientPathCs = "../config/CmdClient.cs"
let clientPathTs = "../config/cmdClient.ts"


import * as fs from "fs";
import * as readline from "readline";
import * as path from "path";

let readStream = fs.createReadStream(path.join(__dirname, routePath));

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
        clientCmd();
        serverCmd();
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
    console.log("build route ok!");
});


function clientCmd() {
    let endStrCs = 'public class Cmd\n{\n'
    let endStrTs = 'export const enum cmd {\n'
    for (let one of cmdObjArr) {
        if (one.note) {
            endStrCs += "    /// <summary>\n    /// " + one.note + "\n    /// </summary>\n";
            endStrTs += "    /**\n     * " + one.note + "\n     */\n";
        }
        let oneStr = one.cmd;
        if (one.cmd.indexOf('.') !== -1) {
            let tmpArr = one.cmd.split('.');
            oneStr = tmpArr[0] + '_' + tmpArr[1] + '_' + tmpArr[2];
        }
        endStrCs += '    public const string ' + oneStr + ' = "' + one.cmd + '";\n';
        endStrTs += "    " + oneStr + ' = "' + one.cmd + '",\n';
    }

    endStrCs += '}';
    endStrTs += '}';
    fs.writeFileSync(path.join(__dirname, clientPathCs), endStrCs);
    fs.writeFileSync(path.join(__dirname, clientPathTs), endStrTs);
}

function serverCmd() {
    let endStr = 'export const enum cmd {\n'
    for (let one of cmdObjArr) {
        if (one.cmd.indexOf('.') === -1) {
            if (one.note) {
                endStr += "    /**\n     * " + one.note + "\n     */\n";
            }
            endStr += "    " + one.cmd + ' = "' + one.cmd + '",\n';
        }
    }
    endStr += '}';

    let csFilename = path.join(__dirname, serverPath);
    fs.writeFileSync(csFilename, endStr);
}