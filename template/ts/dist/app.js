"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var mydog_1 = require("mydog");
var roomMgr_1 = __importDefault(require("./app/domain/roomMgr"));
var app = mydog_1.createApp();
app.set("encodeDecodeConfig", { "encode": null, "decode": decode });
app.configure("gate | connector", function () {
    //"ws" for cocos creator,  "net" for unity
    app.set("connectorConfig", { connector: "net", heartbeat: 6 });
});
app.configure("chat", function () {
    app.set("roomMgr", new roomMgr_1.default(app));
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
