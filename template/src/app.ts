
import { connector, createApp, Session } from "mydog";
let app = createApp();

app.setConfig("connector", { "connector": connector.connectorWs, "clientOnCb": clientOnCb, "clientOffCb": clientOffCb });
app.setConfig("encodeDecode", { "msgDecode": msgDecode, "msgEncode": msgEncode });
app.start();

process.on("uncaughtException", function (err: any) {
    console.log(err)
});






function msgDecode(cmd: number, msg: Buffer): any {
    let msgStr = msg.toString();
    console.log("--->>>", app.routeConfig[cmd], msgStr);
    return JSON.parse(msgStr);
}

function msgEncode(cmd: number, msg: any): Buffer {
    let msgStr = JSON.stringify(msg);
    console.log("<<<---", app.routeConfig[cmd], msgStr);
    return Buffer.from(msgStr);
}


function clientOnCb(session: Session) {
    console.log("one client on");
}

function clientOffCb(session: Session) {
    console.log("one client off");
}