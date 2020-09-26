
import { connector, createApp } from "mydog";

let app = createApp();

app.setConfig("connector", { "connector": connector.connectorTcp });
app.setConfig("rpc", { interval: 30 });

app.setConfig("logger", function (level, info) {
    // console.log(app.serverId, level, info)
});

app.start();

process.on("uncaughtException", function (err: any) {
    console.log(err)
});
