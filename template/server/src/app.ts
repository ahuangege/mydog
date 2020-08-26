
import { createApp, Application, Session, connector } from "mydog";
import roomMgr from "./app/roomMgr";
import { getCpuUsage } from "./app/cpuUsage";

let app = createApp();
app.appName = "chat demo"

app.configure("connector", function () {
    app.route("chat", function (app: Application, session: Session, serverType: string, cb: Function) {
        cb(session.get("chatServerId"));
    });
});

app.setConfig("connector", { "connector": connector.connectorWs });
app.setConfig("encodeDecode", { "msgDecode": msgDecode, "msgEncode": msgEncode });
app.setConfig("rpc", { "interval": 30 });

app.configure("chat", function () {
    app.set("roomMgr", new roomMgr(app));
});

app.on_mydoglist(() => {
    return [{ "title": "cpu(%)", "value": getCpuUsage() }];
});

app.onLog(function (level, info) {
    // console.log(app.serverId, info)
});

app.start();

process.on("uncaughtException", function (err: any) {
    console.log(err)
});


function msgDecode(cmdId: number, msgBuf: Buffer) {
    let msgStr = msgBuf.toString();
    console.log("--->>>", app.routeConfig[cmdId], msgStr);
    return JSON.parse(msgStr);
}

function msgEncode(cmdId: number, msg: any): Buffer {
    let msgStr = JSON.stringify(msg);
    console.log("---<<<", app.routeConfig[cmdId], msgStr);
    return Buffer.from(msgStr);
}

