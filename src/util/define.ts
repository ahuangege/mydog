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
        Rpc_Heart_Beat_Timeout_Time: 20,
    },
    File_Dir: {
        Servers: "servers",
        Config: "config/sys"
    },
    Server_Token: "hi,i am inner server",
    Cli_Token: "hi,i am cli",
    SocketBufferMaxLen: 10 * 1024 * 1024
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
    msg = 1,
    handshake = 2,
    heartbeat = 3,
}

/**
 * server to client 消息类型
 */
export const enum Server_To_Client {
    msg = 1,
    handshake = 2,
    heartbeatResponse = 3
}

/**
 * 内部用户服务器消息类型
 */
export const enum Rpc_Msg {
    register = 1,           // 注册
    heartbeat = 2,          // 心跳
    applySession = 3,       // 后端向前端同步session
    clientMsgIn = 4,        // 收到客户端消息
    clientMsgOut = 5,       // 向客户端发送消息
    rpcMsg = 6              // rpc消息
}