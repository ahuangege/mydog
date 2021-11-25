
import { connector, createApp, Session } from "mydog";
import { getCpuUsage } from "./cpuUsage";
let app = createApp();

app.setConfig("connector", { "connector": connector.Ws, "clientOnCb": clientOnCb, "heartbeat": 60, "clientOffCb": clientOffCb, "interval": 50 });
app.setConfig("encodeDecode", { "msgDecode": msgDecode, "msgEncode": msgEncode });
app.setConfig("logger", (type, level, msg) => {
    if (level === "warn" || level === "error") {
        console.log(msg);
    }
});
app.setConfig("rpc", { "interval": 33 });
app.setConfig("mydogList", () => {
    return [{ "title": "cpu", "value": getCpuUsage() }]
})

app.start();

process.on("uncaughtException", function (err: any) {
    console.log(err)
});


function msgDecode(cmd: number, msg: Buffer): any {
    let msgStr = msg.toString();
    console.log("↑ ", app.routeConfig[cmd], msgStr);
    return JSON.parse(msgStr);
}

function msgEncode(cmd: number, msg: any): Buffer {
    let msgStr = JSON.stringify(msg);
    console.log(" ↓", app.routeConfig[cmd], msgStr);
    return Buffer.from(msgStr);
}


function clientOnCb(session: Session) {
    console.log("one client on");
}

function clientOffCb(session: Session) {
    console.log("one client off");
}
