

/**
 * 
 * HOME: http://www.mydog.wiki
 * 
 */

/**
 * Create app
 */
export function createApp(): Application;

/**
 * The app being created
 */
export let app: Application;

/**
 * Mydog version
 */
export let version: string;

/**
 * Three types of connectors
 */
export let connector: {
    Tcp: I_connectorConstructor,
    Ws: I_connectorConstructor,
    Wss: I_connectorConstructor,
}

/**
 * App class
 */
export interface Application {

    /**
     * Application Name
     */
    appName: string;

    /**
     * Root path
     */
    readonly base: string;

    /**
     * Startup environment
     */
    readonly env: string;

    /**
     * Server id
     */
    readonly serverId: string;

    /**
     * Server type
     */
    readonly serverType: string;

    /**
     * The configuration of this server
     */
    readonly serverInfo: ServerInfo;

    /**
     * configuration：route.ts
     */
    readonly routeConfig: string[];

    /**
     * configuration：master.ts
     */
    readonly masterConfig: ServerInfo;

    /**
     * configuration：servers.ts
     */
    readonly serversConfig: { [serverType: string]: ServerInfo[] };

    /**
     * Server start time
     */
    readonly startTime: number;

    /**
     * The number of all socket connections (frontend server call)
     */
    readonly clientNum: number;

    /**
     * rpc call
     */
    readonly rpc: (serverId: string) => Rpc;

    /**
     * Start the server
     */
    start(): void;

    /**
     * rpc configuration
     */
    setConfig(key: "rpc", value: I_rpcConfig): void;
    /**
     * connector configuration
     */
    setConfig(key: "connector", value: I_connectorConfig): void;
    /**
     * codec configuration
     */
    setConfig(key: "encodeDecode", value: I_encodeDecodeConfig): void;
    /**
     * ssh configuration
     */
    setConfig(key: "ssh", value: string[]): void;
    /**
     * authentication key configuration
     */
    setConfig(key: "recognizeToken", value: I_recognizeTokenConfig): void;
    /**
     * internal log output
     */
    setConfig(key: "logger", value: (level: "info" | "warn" | "error", msg: string) => void): void;
    /**
     * custom monitoring
     */
    setConfig(key: "mydogList", value: () => { "title": string, "value": string }[]): void;

    /**
     * Set key-value pairs
     */
    set<T = any>(key: string | number, value: T): T

    /**
     * Get key-value pairs
     */
    get<T = any>(key: string | number): T;

    /**
     * Delete key-value pairs
     */
    delete(key: string | number): void;

    /**
     * Get a certain type of server
     */
    getServersByType(serverType: string): ServerInfo[];

    /**
     * Get a server
     */
    getServerById(serverId: string): ServerInfo;

    /**
     * Routing configuration (frontend server call)
     */
    route(serverType: string, routeFunc: (session: Session) => string): void;

    /**
     * Get session by uid (frontend server call)
     */
    getSession(uid: number): Session;

    /**
     * Send a message to the client (frontend server call)
     */
    sendMsgByUid(cmd: number, msg: any, uids: number[]): void;

    /**
     * Send a message to all clients of this server (frontend server call)
     */
    sendAll(cmd: number, msg: any): void;

    /**
     * Send a message to the client (backend server call)
     */
    sendMsgByUidSid(cmd: number, msg: any, uidsid: { "uid": number, "sid": string }[]): void;

    /**
     * Send a message to the client (backend server call)
     */
    sendMsgByGroup(cmd: number, msg: any, group: { [sid: string]: number[] }): void;

    /**
     * Configure server execution function
     * @param type serverType, "all" or "gate|connector" form
     * @param cb execution function
     */
    configure(type: string, cb: () => void): void;

    /**
     * Monitor events (add server, remove server)
     */
    on(event: "onAddServer" | "onRemoveServer", cb: (serverInfo: ServerInfo) => void): void;

}

/**
 * Session class
 */
export interface Session {
    /**
     * binded uid
     */
    readonly uid: number;

    /**
     * frontend server id
     */
    readonly sid: string;

    /**
     * Set key-value pairs
     */
    set(value: { [key: string]: any }): void;

    /**
     * Get key-value pairs
     */
    get<T = any>(key: number | string): T;

    /**
     * Delete key-value pair
     */
    delete(keys: (number | string)[]): void;

    /**
     * Set key-value pairs (local)
     */
    setLocal(key: number | string, value: any): void;

    /**
     * Get key-value pairs (local)
     */
    getLocal<T = any>(key: number | string): T;

    /**
     * Delete key-value pair (local)
     */
    deleteLocal(key: number | string): void;

    /**
     * Bind uid (frontend server call)
     */
    bind(uid: number): boolean;

    /**
     * Close connection (frontend server call)
     */
    close(): void;

    /**
     * Sync the backend session to the frontend (backend server call)
     */
    apply(): void;

    /**
     * Get ip (frontend server call)
     */
    getIp(): string;

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

/**
 * rpc interface
 */
declare global {
    interface Rpc {
    }
}

/**
 * rpc call, internal error code
 */
export const enum rpcErr {
    /**
     * no err
     */
    ok = 0,
    /**
     * no target server
     */
    noServer = 1,
    /**
     * rpc timeout
     */
    timeout = 2
}

/**
 * codec configuration
 */
interface I_encodeDecodeConfig {
    /**
     * protocol encoding
     */
    "protoEncode"?: (cmd: number, msg: any) => Buffer,
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
 * connector configuration
 */
interface I_connectorConfig {
    /**
     * custom connector class (default tcp)
     */
    "connector"?: I_connectorConstructor,
    /**
     * heartbeat (seconds, default none)
     */
    "heartbeat"?: number,
    /**
     * maximum number of connections (no upper limit by default)
     */
    "maxConnectionNum"?: number,
    /**
     * maximum message packet length (default 10 Mb)
     */
    "maxLen"?: number
    /**
     * whether to enable Nagle algorithm (not enabled by default)
     */
    "noDelay"?: boolean,
    /**
     * message sending frequency (ms, more than 10 is enabled, the default is to send immediately)
     */
    "interval"?: number,
    /**
     * client connection notification
     */
    "clientOnCb"?: (session: Session) => void,
    /**
     * client leaving notification
     */
    "clientOffCb"?: (session: Session) => void,
    /**
     * message filtering. Return true, the message will be discarded.
     */
    "cmdFilter"?: (session: Session, cmd: number) => boolean,

    [key: string]: any,
}

/**
 * rpc configuration
 */
interface I_rpcConfig {
    /**
     * timeout (seconds, use more than 5, default 10)
     */
    "timeout"?: number,
    /**
     * maximum message packet length (default 10 Mb)
     */
    "maxLen"?: number,
    /**
     * message sending frequency (ms, more than 10 is enabled, the default is to send immediately)
     */
    "interval"?: number | { "default": number, [serverType: string]: number }
    /**
     * whether to enable Nagle algorithm (not enabled by default)
     */
    "noDelay"?: boolean,
    /**
     * heartbeat (seconds, use more than 5, default 60)
     */
    "heartbeat"?: number,
    /**
     * reconnection interval (seconds, default 2)
     */
    "reconnectDelay"?: number,
    /**
     * matrix without socket connection
     */
    "noRpcMatrix"?: { [serverType: string]: string[] }
}

/**
 * authentication key configuration
 */
interface I_recognizeTokenConfig {
    /**
     * server internal authentication key
     */
    "serverToken"?: string,
    /**
     * master and cli authentication key
     */
    "cliToken"?: string,
}

/**
 * Custom connector class
 */
export interface I_connectorConstructor {
    new(info: { app: Application, clientManager: I_clientManager, config: I_connectorConfig, startCb: () => void }): void;
}

/**
 * User socket management
 */
export interface I_clientManager {
    addClient(client: I_clientSocket): void;
    handleMsg(client: I_clientSocket, msg: Buffer): void;
    removeClient(client: I_clientSocket): void;
}

/**
 * User socket
 */
export interface I_clientSocket {
    /**
     * session (Note: Assignment within the framework)
     */
    readonly session: Session;

    /**
     * ip (Session gets the ip from here)
     */
    remoteAddress: string;

    /**
     * send messages
     */
    send(msg: Buffer): void;

    /**
     * close
     */
    close(): void;
}
