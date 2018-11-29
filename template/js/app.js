
var mydog = require("mydog");
var roomMgr = require("./app/domain/roomMgr");

var app = mydog.createApp();

app.set("encodeDecodeConfig", { "encode": null, "decode": decode });

app.configure("gate | connector", function () {
    //"ws" for cocos creator,  "net" for unity
    app.set("connectorConfig", { connector: "net", heartbeat: 6 });
});

app.configure("chat", function () {
    app.set("roomMgr", new roomMgr(app));
});

app.route("chat", function (app, session, serverType, cb) {
    cb(session.get("chatServerId"));
});

app.onLog(function (filename, level, info) {
    // console.log(level, filename, info);
});

app.start();


process.on("uncaughtException", function (err) {
    console.log(err);
});

function decode(cmdId, msgBuf) {
    console.log(app.routeConfig[cmdId]);
    return JSON.parse(msgBuf);
}
