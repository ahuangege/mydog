/**
 * 一些默认配置
 */
export let some_config = {
    Time: {
        Monitor_Reconnect_Time: 5,
        Monitor_Heart_Beat_Time: 60,
        Monitor_Heart_Beat_Timeout_Time: 10,

        Rpc_Reconnect_Time: 5,
        Rpc_Heart_Beat_Time: 60,
        Rpc_Heart_Beat_Timeout_Time: 10,

        Remote_Reconnect_Time: 5,
        Remote_Heart_Beat_Time: 60,
        Remote_Heart_Beat_Timeout_Time: 10
    },
    File_Dir: {
        Servers: "servers",
        Config: "config/sys"
    },
    Connector: {
        Net: "net",
        Ws: "ws"
    },
    Server_Token: "hi,i am inner server",
    Master_Client_Token: "hi,i am client",
}

/**
 * master to monitor 消息类型
 */
export const enum Master_To_Monitor {
    addServer = 1,
    removeServer = 2,
    cliMsg = 3,
    heartbeatResponse = 4
}

/**
 * monitor to master 消息类型
 */
export const enum Monitor_To_Master {
    register = 1,
    heartbeat = 2,
    cliMsg = 3
}

/**
 * cli工具 to master 消息类型
 */
export const enum Cli_To_Master {
    register = 1,
    heartbeat = 2,
    cliMsg = 3
}

/**
 * client to server 消息类型
 */
export const enum Client_To_Server {
    handshake = 1,
    heartbeat = 2,
    msg = 3
}

/**
 * server to client 消息类型
 */
export const enum Server_To_Client {
    handshake = 1,
    msg = 2,
    heartbeatResponse = 3
}

/**
 * front to back 消息类型
 */
export const enum Front_To_Back {
    register = 1,
    heartbeat = 2,
    msg = 3
}

/**
 * back to front 消息类型
 */
export const enum Back_To_Front {
    msg = 1,
    applySession = 2,
    heartbeatResponse = 3
}

/**
 * rpc_client to rpc_server 消息类型
 */
export const enum Rpc_Client_To_Server {
    register = 1,
    heartbeat = 2,
    msg = 3
}

/**
 * rpc_server to rpc_client 消息类型
 */
export const enum Rpc_Server_To_Client {
    msg = 1,
    heartbeatResponse = 2
}