var mydog = require("mydog");

var app = mydog.createApp();

app.serverToken = "chat demo";  //password used in inner server


app.configure("gate | connector", function () {
    app.set("connectorConfig", {
        "connector": "ws",          //"ws" for cocos creator,  "net" for unity
        "encode": null,
        "decode": null
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
    // console[level].apply(null, arguments)
    // console.log(name, level, info)
});

app.start();

process.on('uncaughtException', function (err) {
    console.error(' caught exception: ' + err.stack);
});
