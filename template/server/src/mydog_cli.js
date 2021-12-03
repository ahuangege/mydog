"use strict";
exports.__esModule = true;
exports.mydog_send = exports.mydog_cmd = void 0;
var fs = require("fs");
var path = require("path");
/** 接收 mydog cmd 命令 */
function mydog_cmd(lans, cmdObjArr) {
    // console.log(lans, cmdObjArr);
    if (lans.includes("ts")) {
        var endStr = 'export const enum cmd {\n';
        for (var _i = 0, cmdObjArr_1 = cmdObjArr; _i < cmdObjArr_1.length; _i++) {
            var one = cmdObjArr_1[_i];
            if (one.note) {
                endStr += "\t/**\n\t * " + one.note + "\n\t */\n";
            }
            var oneStr = one.cmd;
            if (one.cmd.indexOf('.') !== -1) {
                var tmpArr = one.cmd.split('.');
                oneStr = tmpArr[0] + '_' + tmpArr[1] + '_' + tmpArr[2];
            }
            endStr += "\t" + oneStr + " = \"" + one.cmd + "\",\n";
        }
        endStr += '}';
        fs.writeFileSync(path.join(__dirname, "config/cmdClient.ts"), endStr);
    }
    if (lans.includes("cs")) {
        var endStr = 'public class Cmd\n{\n';
        for (var _a = 0, cmdObjArr_2 = cmdObjArr; _a < cmdObjArr_2.length; _a++) {
            var one = cmdObjArr_2[_a];
            if (one.note) {
                endStr += "\t/// <summary>\n\t/// " + one.note + "\n\t/// </summary>\n";
            }
            var oneStr = one.cmd;
            if (one.cmd.indexOf('.') !== -1) {
                var tmpArr = one.cmd.split('.');
                oneStr = tmpArr[0] + '_' + tmpArr[1] + '_' + tmpArr[2];
            }
            endStr += "\tpublic const string " + oneStr + " = \"" + one.cmd + "\";\n";
        }
        endStr += '}';
        fs.writeFileSync(path.join(__dirname, "config/CmdClient.cs"), endStr);
    }
    if (lans.includes("lua")) {
        var endStr = 'local cmd = {}\n';
        for (var _b = 0, cmdObjArr_3 = cmdObjArr; _b < cmdObjArr_3.length; _b++) {
            var one = cmdObjArr_3[_b];
            if (one.note) {
                endStr += "-- " + one.note + "\n";
            }
            var oneStr = one.cmd;
            if (one.cmd.indexOf('.') !== -1) {
                var tmpArr = one.cmd.split('.');
                oneStr = tmpArr[0] + '_' + tmpArr[1] + '_' + tmpArr[2];
            }
            endStr += "cmd." + oneStr + " = \"" + one.cmd + "\"\n";
        }
        endStr += 'return cmd';
        fs.writeFileSync(path.join(__dirname, "config/cmdClient.lua"), endStr);
    }
}
exports.mydog_cmd = mydog_cmd;
/** 接收 mydog send 命令的消息回调 */
function mydog_send(reqArgv, timeoutIds, data) {
    console.log(reqArgv, timeoutIds, data);
}
exports.mydog_send = mydog_send;
