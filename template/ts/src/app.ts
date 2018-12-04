import { createApp, Application, Session } from "mydog"
import roomMgr from "./app/domain/roomMgr";

let app = createApp();

app.set("encodeDecodeConfig", { "encode": null, "decode": decode });
app.set("rpcConfig", { "timeOut": "9" })

app.configure("gate | connector", function () {
    //"ws" for cocos creator,  "net" for unity
    app.set("connectorConfig", { connector: "net", heartbeat: 6 });
});


app.configure("chat", function () {
    app.set("roomMgr", new roomMgr(app));
});

app.configure("chat", function () {
    setTimeout(function () {
        console.log("发送测试---");
        app.rpc.toServer("chat-server-1").chat.chatRemote.test("aaa", "bbb", function (err: any, num: number, str: string) {
            console.log("回调", err, num, str)
        });
    }, 2000)
});

app.route("chat", function (app: Application, session: Session, serverType: string, cb: Function) {
    cb(session.get("chatServerId"));
});

app.onLog(function (filename: string, level: string, info: string) {
    // console.log(level, filename, info);
});

app.start();

process.on("uncaughtException", function (err: any) {
    console.log(err)
})

function decode(cmdId: number, msgBuf: Buffer): any {
    console.log(app.routeConfig[cmdId]);
    return JSON.parse(msgBuf as any);
}

