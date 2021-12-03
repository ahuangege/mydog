import * as fs from "fs";
import * as path from "path";

/** 接收 mydog cmd 命令 */
export function mydog_cmd(lans: string[], cmdObjArr: { "cmd": string, "note": string }[]) {
    // console.log(lans, cmdObjArr);

    if (lans.includes("ts")) {
        let endStr = 'export const enum cmd {\n'
        for (let one of cmdObjArr) {
            if (one.note) {
                endStr += `\t/**\n\t * ${one.note}\n\t */\n`;
            }
            let oneStr = one.cmd;
            if (one.cmd.indexOf('.') !== -1) {
                let tmpArr = one.cmd.split('.');
                oneStr = tmpArr[0] + '_' + tmpArr[1] + '_' + tmpArr[2];
            }
            endStr += `\t${oneStr} = "${one.cmd}",\n`;
        }
        endStr += '}';
        fs.writeFileSync(path.join(__dirname, "config/cmdClient.ts"), endStr);
    }
    if (lans.includes("cs")) {
        let endStr = 'public class Cmd\n{\n'
        for (let one of cmdObjArr) {
            if (one.note) {
                endStr += `\t/// <summary>\n\t/// ${one.note}\n\t/// </summary>\n`;
            }
            let oneStr = one.cmd;
            if (one.cmd.indexOf('.') !== -1) {
                let tmpArr = one.cmd.split('.');
                oneStr = tmpArr[0] + '_' + tmpArr[1] + '_' + tmpArr[2];
            }
            endStr += `\tpublic const string ${oneStr} = "${one.cmd}";\n`;
        }
        endStr += '}';
        fs.writeFileSync(path.join(__dirname, "config/CmdClient.cs"), endStr);
    }
    if (lans.includes("lua")) {
        let endStr = 'local cmd = {}\n'
        for (let one of cmdObjArr) {
            if (one.note) {
                endStr += `-- ${one.note}\n`;
            }
            let oneStr = one.cmd;
            if (one.cmd.indexOf('.') !== -1) {
                let tmpArr = one.cmd.split('.');
                oneStr = tmpArr[0] + '_' + tmpArr[1] + '_' + tmpArr[2];
            }
            endStr += `cmd.${oneStr} = "${one.cmd}"\n`;
        }
        endStr += 'return cmd';
        fs.writeFileSync(path.join(__dirname, "config/cmdClient.lua"), endStr);
    }
}

/** 接收 mydog send 命令的消息回调 */
export function mydog_send(reqArgv: any, timeoutIds: string[], data: { "id": string, "serverType": string, "data": any }[]) {
    console.log(data);
}