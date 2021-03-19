import { EventEmitter } from "events";
import { I_connectorConfig, I_encodeDecodeConfig, I_rpcConfig, ServerInfo } from "../..";
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
    close(): void;
    send(data: Buffer): void;
}

/**
 * The monitor receives the new server information format from the master
 */
export interface monitor_get_new_server {
    "T": number;
    "servers": {
        [id: string]: ServerInfo
    };
}

/**
 * The monitor receives the removal server information format from the master
 */
export interface monitor_remove_server {
    "T": number;
    "id": string;
    "serverType": string;
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
 * The session copied from the front end to the back end
 */
export interface sessionCopyJson {
    uid: number;
    sid: string;
    settings: { [key: string]: any };
}

/**
 * Internal frame log level
 */
export const enum loggerType {
    info = "info",
    warn = "warn",
    error = "error"
}


/**
 * rpc message-oriented package
 * 1. If there is cmd and id, it means the message is received and needs to be called back
 * 2. With cmd without id means no need to call back when the message is received
 * 3. If there is an id without cmd, it means it is a callback message
 * 4. len represents the length of the last Buffer parameter
 */
export interface I_rpcMsg {
    cmd?: string;
    id?: number;
    len?: number;
}

/**
 * rpc request timeout
 */
export interface I_rpcTimeout {
    cb: Function;
    time: number;
}


export interface I_someConfig {
    "rpc": I_rpcConfig,             // rpc configuration
    "connector": I_connectorConfig, // Front-end connector connection server configuration
    "encodeDecode": I_encodeDecodeConfig,   // Codec configuration
    "ssh": string[],                // ssh configuration
    "recognizeToken": { "serverToken": string, "cliToken": string },    // Authentication key
    "logger": (level: loggerType, msg: string) => void,           // Internal log output
    "mydogList": () => { "title": string, "value": string }[],      // Custom monitoring
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
    send(msg: Buffer): void;
    close(): void;
}
