"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 一些默认配置
 */
exports.some_config = {
    Time: {
        Monitor_Reconnect_Time: 5,
        Monitor_Heart_Beat_Time: 60,
        Rpc_Reconnect_Time: 5,
        Rpc_Heart_Beat_Time: 60,
        Remote_Reconnect_Time: 5,
        Remote_Heart_Beat_Time: 60
    },
    File_Dir: {
        Servers: "app/servers",
        Config: "config/sys"
    },
    Connector: {
        Net: "net",
        Ws: "ws"
    },
    Server_Token: "hi,i am inner server",
    Master_Client_Token: "hi,i am client",
};
