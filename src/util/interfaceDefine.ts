import { EventEmitter } from "events";
import { I_connectorConfig, I_encodeDecodeConfig, I_recognizeTokenConfig, I_rpcConfig, I_sessionConfig, ServerInfo } from "../mydog";

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
    "recognizeToken": I_recognizeTokenConfig,    // Authentication key
    "logger": (level: loggerLevel, msg: string) => void,           // Internal log output
    "mydogList": () => { "title": string, "value": string }[],      // Custom monitoring
    "onBeforeExit": () => Promise<void>,       // beforeExit notice
    "session": I_sessionConfig // backend session  configuration
}
