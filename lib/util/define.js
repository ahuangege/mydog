"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.some_config = void 0;
/**
 * 一些默认配置
 */
exports.some_config = {
    Time: {
        Monitor_Reconnect_Time: 2,
        Monitor_Heart_Beat_Time: 60,
        Monitor_Heart_Beat_Timeout_Time: 10,
        Rpc_Reconnect_Time: 2,
        Rpc_Heart_Beat_Time: 60,
        Rpc_Heart_Beat_Timeout_Time: 10,
    },
    File_Dir: {
        Servers: "servers",
        Config: "config/sys"
    },
    Server_Token: "hi,i am inner server",
    Cli_Token: "hi,i am cli",
    SocketBufferMaxLenUnregister: 1024,
    SocketBufferMaxLen: 10 * 1024 * 1024
};
