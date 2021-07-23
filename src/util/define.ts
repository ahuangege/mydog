/**
 * Some default configurations
 */
export let some_config = {
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
    SocketBufferMaxLenUnregister: 1024, // Unregistered socket, maximum message length
    SocketBufferMaxLen: 10 * 1024 * 1024
}

/**
 * master to monitor, message type
 */
export const enum Master_To_Monitor {
    addServer = 1,
    removeServer = 2,
    cliMsg = 3,
    heartbeatResponse = 4
}

/**
 * monitor to master, message type
 */
export const enum Monitor_To_Master {
    register = 1,
    heartbeat = 2,
    cliMsg = 3
}

/**
 * cli to master, message type
 */
export const enum Cli_To_Master {
    register = 1,
    heartbeat = 2,
    cliMsg = 3
}

/**
 * client to server, message type
 */
export const enum Client_To_Server {
    msg = 1,
    handshake = 2,
    heartbeat = 3,
}

/**
 * server to client, message type
 */
export const enum Server_To_Client {
    msg = 1,
    handshake = 2,
    heartbeatResponse = 3
}

/**
 * Internal user server message type
 */
export const enum Rpc_Msg {
    register = 1,           // registered
    heartbeat = 2,          // heartbeat
    applySession = 3,       // Synchronize session from backend to frontend
    clientMsgIn = 4,        // Client message received
    clientMsgOut = 5,       // Send a message to the client
    rpcMsg = 6,              // rpc message
    rpcMsgAwait = 7,              // rpc message await
}