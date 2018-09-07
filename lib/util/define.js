module.exports = {
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

    Master_To_Monitor: {
        addServer: 1,
        removeServer: 2,
        cliMsg: 3
    },
    Monitor_To_Master: {
        register: 1,
        heartbeat: 2,
        cliMsg: 3
    },
    Cli_To_Master: {
        register: 1,
        heartbeat: 2,
        cliMsg: 3
    },
    Client_To_Server: {
        handshake: 1,
        heartbeat: 2,
        msg: 3
    },
    Server_To_Client: {
        handshake: 1,
        msg: 2
    },
    Front_To_Back: {
        register: 1,
        heartbeat: 2,
        msg: 3
    },
    Back_To_Front: {
        msg: 1,
        applySession: 2
    },
    Rpc_Msg: {
        register: 1,
        heartbeat: 2,
        msg: 3
    }
};