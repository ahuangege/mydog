import { EventEmitter } from "events";
import Application from "../application";
import { Session } from "../components/session";

/**
 * socket connection proxy
 */
export interface SocketProxy extends EventEmitter {
    socket: any;
    remoteAddress: string;
    die: boolean;
    maxLen: number;
    len: number;
    buffer: Buffer;
    headLen: number;
    headBuf: Buffer;
    close(): void;
    send(data: Buffer): void;
}


export interface monitor_syncAllServers {
    "T": number;
    "all": ServerInfo[]
}

export interface monitor_updateServers {
    "T": number;
    "update": ServerInfo[];
    "del": string[];
}


/**
 * The message format when the monitor registers with the master
 */
export interface monitor_reg_master {
    T: number,
    serverToken?: string,
    cliToken?: string,
    serverInfo: ServerInfo
}



/**
 * Internal frame log level
 */
export const enum loggerLevel {
    debug = "debug",
    info = "info",
    error = "error"
}




/**
 * rpc message-oriented package
 * 1. If there is cmd and id, it means the message is received and needs to be called back
 * 2. With cmd without id means no need to call back when the message is received
 * 3. If there is an id without cmd, it means it is a callback message
 */
export interface I_rpcMsg {
    isSys?: number;
    cmd?: string;
    id?: number;
    err?: number;
}


export interface I_someConfig {
    "rpc": I_rpcConfig,             // rpc configuration
    "connector": I_connectorConfig, // Front-end connector connection server configuration
    "encodeDecode": I_encodeDecodeConfig,   // Codec configuration
    "ssh": string[],                // ssh configuration
    "recognizeToken": { "serverToken"?: string, "cliToken"?: string },    // Authentication key
    "logger": (level: loggerLevel, msg: string) => void,           // Internal log output
    "mydogList": () => { "title": string, "value": string }[],      // Custom monitoring
    "onBeforeExit": () => Promise<void>,       // beforeExit notice
    "session": { "noNeedSyncServerTypes"?: string[], "expireSeconds"?: number, "maxCacheCount"?: number } // backend session  configuration
}

/**
 * Connect the user's socket management agent
 */
export interface I_clientManager {
    addClient(client: I_clientSocket): void;
    handleMsg(client: I_clientSocket, msg: Buffer): void;
    removeClient(client: I_clientSocket): void;
}

/**
 * Connection server constructor
 */
export interface I_connectorConstructor {
    new(info: { app: Application, clientManager: I_clientManager, config: I_connectorConfig, startCb: () => void }): void;
}

/**
 * Socket for each user
 */
export interface I_clientSocket {
    session: Session;
    remoteAddress: string;
    send(msg: Buffer, msg2?: Buffer): void;
    close(): void;
}



/**
 * connector configuration
 */
export interface I_connectorConfig {
    /**
     * custom connector class (default tcp)
     */
    "connector"?: I_connectorConstructor,
    /**
     * heartbeat (seconds, default none)
     */
    "heartbeat"?: number,
    /**
     * maximum number of connections (default is 2000)
     */
    "maxConnectionNum"?: number,
    /**
     * maximum message packet length (default 10 MB)
     */
    "maxLen"?: number
    /**
     * whether to enable Nagle algorithm (not enabled by default)
     */
    "noDelay"?: boolean,
    /**
     * message sending frequency (ms,  the default is 33 ms)
     */
    "interval"?: number,
    /**
     * message cache max length . The default is 32KB.
     */
    "intervalCacheLen"?: number,
    /**
     * client connection notification
     */
    "clientOnCb"?: (session: Session) => void,
    /**
     * client leaving notification
     */
    "clientOffCb"?: (session: Session) => void,

    [key: string]: any,
}


/**
 * codec configuration
 */
export interface I_encodeDecodeConfig {
    /**
     * protocol encoding
     */
    "protoEncode"?: (cmd: number, msg: any) => { "head": Buffer, "msg": Buffer },
    /**
     * message encoding
     */
    "msgEncode"?: (cmd: number, msg: any) => Buffer,
    /**
     * protocol decoding
     */
    "protoDecode"?: (data: Buffer) => { "cmd": number, "msg": Buffer },
    /**
     * message decoding
     */
    "msgDecode"?: (cmd: number, msg: Buffer) => any,
}


/**
 * rpc configuration
 */
export interface I_rpcConfig {
    /**
     * timeout (seconds, use more than 5, default 10)
     */
    "timeout"?: number,
    /**
     * maximum message packet length (default 10 MB)
     */
    "maxLen"?: number,
    /**
     * message sending frequency (ms, the default is 33)
     */
    "interval"?: number | { "default": number, [serverType: string]: number }
    /**
     * message cache max length. The default is 32 KB.
     */
    "intervalCacheLen"?: number,
    /**
     * whether to enable Nagle algorithm (not enabled by default)
     */
    "noDelay"?: boolean,
    /**
     * heartbeat (seconds, use more than 5, default 60)
     */
    "heartbeat"?: number,
    /**
     * matrix without socket connection
     */
    "noRpcMatrix"?: { [serverType: string]: string[] },
    /**
     * Rpc message cache count of the process. The default is 50000.
     */
    "rpcMsgCacheCount"?: number,
    /**
     * Rpc message cache buffer size of the process. The default is 64 MB.
     */
    "rpcMsgCacheSize"?: number,
    /**
     * The frequency of  Rpc socket  establishment
     */
    "socketPerSecond"?: number,
    /**
    * keep rpc call stack when error happens. (may affect performance. default false )
    */
    "errStack"?: boolean
}


/**
 * server information
 */
export interface ServerInfo {
    /**
     * Server id
     */
    readonly id: string;
    /**
     * host
     */
    readonly host: string;
    /**
     * port
     */
    readonly port: number;
    /**
     * Is it a frontend server
     */
    readonly frontend: boolean;
    /**
     * clientPort
     */
    readonly clientPort: number;
    /**
     * Server type [Note: Assigned by the framework]
     */
    readonly serverType: string;

    [key: string]: any;
}