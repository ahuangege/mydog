var mydog = require("mydog");

var app = mydog.createApp();

app.set("encodeDecodeConfig", {
    "encode": null,
    "decode": decode
});
app.configure("gate | connector", function () {
    app.set("connectorConfig", {
        "connector": "ws",          //"ws" for cocos creator,  "net" for unity
        "heartbeat": 6
    });
});


app.configure("chat", function () {
    var roomMgr = app.loadFile("app/domain/roomMgr.js");
    app.set("roomMgr", new roomMgr(app));
});

app.route("chat", function (app, session, serverType, cb) {
    cb(null, session.get("chatServerId"));
});


app.onLog(function (name, level, info) {    //inner log(debug, info, error)
    // console.log(name, level, info)
});

app.start();

process.on('uncaughtException', function (err) {
    console.error(' caught exception: ' + err.stack);
});

function decode(cmdId, msgBuf) {
    console.log(app.routeConfig[cmdId]);
    return JSON.parse(msgBuf);
}