/**
 * app class
 */


import * as path from "path"
import { I_someConfig, loggerType, I_clientSocket } from "./util/interfaceDefine";
import * as appUtil from "./util/appUtil";
import { EventEmitter } from "events";
import { RpcSocketPool } from "./components/rpcSocketPool";
import { FrontendServer } from "./components/frontendServer";
import { BackendServer } from "./components/backendServer";
import { I_connectorConfig, I_encodeDecodeConfig, I_rpcConfig, ServerInfo } from "..";
import { Session } from "./components/session";

declare global {
    interface Rpc {
    }
}

export default class Application extends EventEmitter {
    appName: string = "hello world";                                                         // App name
    hasStarted: boolean = false;                                                             // Whether has started
    main: string = "";                                                                       // Startup file
    base: string = path.dirname((require.main as any).filename);                             // Root path

    routeConfig: string[] = [];                                                              // route.ts
    masterConfig: ServerInfo = {} as ServerInfo;                                             // master.ts
    serversConfig: { [serverType: string]: ServerInfo[] } = {};                              // servers.ts
    routeConfig2: string[][] = [];                                                           // route.ts  (split)

    clientNum: number = 0;                                                                   // Number of all socket connections
    clients: { [uid: number]: I_clientSocket } = {};                                         // Sockets that have been binded
    settings: { [key: string]: any } = {};                                                   // User set，get  

    servers: { [serverType: string]: ServerInfo[] } = {};                                    // All user servers that are running
    serversIdMap: { [id: string]: ServerInfo } = {};                                         // All user servers that are running (Dictionary format)

    serverInfo: ServerInfo = {} as ServerInfo;                                               // The configuration of this server
    isDaemon: boolean = false;                                                               // Whether to run in the background
    env: string = "";                                                                        // environment
    serverId: string = "";                                                                   // Server name id, the unique identifier of the server
    serverType: string = "";                                                                 // Server type
    frontend: boolean = false;                                                               // Is it a front-end server
    startMode: "all" | "alone" = "all";                                                      // Start Mode:  all / alone
    startTime: number = 0;                                                                   // Start time

    router: { [serverType: string]: (session: Session) => string } = {};                     // Pre-selection when routing messages to the backend
    rpc: (serverId: string) => Rpc = null as any;                                            // Rpc packaging
    rpcPool: RpcSocketPool = new RpcSocketPool();                                            // Rpc socket pool

    logger: (level: loggerType, msg: string) => void = function () { };                      // Internal log output port

    msgEncode: Required<I_encodeDecodeConfig>["msgEncode"] = null as any;
    msgDecode: Required<I_encodeDecodeConfig>["msgDecode"] = null as any;
    protoEncode: Required<I_encodeDecodeConfig>["protoEncode"] = null as any;
    protoDecode: Required<I_encodeDecodeConfig>["protoDecode"] = null as any;

    someconfig: I_someConfig = {} as any;                                                    // Partially open configuration
    noRpcMatrix: { [svrT_svrT: string]: boolean } = {};                                      // The configuration of not establishing a socket connection between servers
    frontendServer: FrontendServer = null as any;
    backendServer: BackendServer = null as any;

    constructor() {
        super();
        appUtil.defaultConfiguration(this);
    }

    /**
     * Start up
     */
    start() {
        if (this.hasStarted) {
            console.error("the app has already started");
            return;
        }
        this.hasStarted = true;
        this.startTime = new Date().getTime();
        appUtil.startServer(this);
    }


    setConfig(key: "rpc", value: I_rpcConfig): void
    setConfig(key: "connector", value: I_connectorConfig): void
    setConfig(key: "encodeDecode", value: Partial<I_encodeDecodeConfig>): void
    setConfig(key: "ssh", value: string[]): void
    setConfig(key: "recognizeToken", value: { "serverToken"?: string, "cliToken"?: string }): void
    setConfig(key: "logger", value: (level: loggerType, msg: string) => void): void
    setConfig(key: "mydogList", value: () => { "title": string, "value": string }[]): void
    setConfig(key: keyof I_someConfig, value: any): void {
        this.someconfig[key] = value;
        if (key === "logger") {
            this.logger = value;
        } else if (key === "rpc") {
            let noRpcMatrix = value["noRpcMatrix"] || {};
            for (let svrT1 in noRpcMatrix) {
                let arr = noRpcMatrix[svrT1];
                for (let svrT2 of arr) {
                    this.noRpcMatrix[appUtil.getNoRpcKey(svrT1, svrT2)] = true;
                }
            }
        }
    }

    /**
     * Set key-value pairs
     */
    set(key: string | number, value: any) {
        this.settings[key] = value;
        return value;
    }

    /**
     * Get the value corresponding to the key
     */
    get(key: string | number) {
        return this.settings[key];
    }

    /**
     * Delete a key-value pair
     */
    delete(key: string | number) {
        delete this.settings[key];
    }


    /**
     * Get the server array according to the server type
     */
    getServersByType(serverType: string) {
        return this.servers[serverType] || [];
    }

    /**
     * Get a server configuration
     */
    getServerById(serverId: string) {
        return this.serversIdMap[serverId];
    }

    /**
     * Routing configuration (deciding which backend to call)
     * @param serverType Back-end server type
     * @param routeFunc Configuration function
     */
    route(serverType: string, routeFunc: (session: Session) => string) {
        this.router[serverType] = routeFunc;
    }

    /**
     * get client by uid
     */
    getClient(uid: number) {
        let client = this.clients[uid];
        if (client) {
            return client.session;
        } else {
            return null;
        }
    }

    /**
     * Send a message to the client
     * @param cmd   cmd
     * @param msg   message
     * @param uids  uid array [1,2]
     */
    sendMsgByUid(cmd: number, msg: any, uids: number[]) {
        if (msg === undefined) {
            msg = null;
        }
        let msgBuf = this.protoEncode(cmd, msg);
        let client: I_clientSocket;
        let i: number;
        for (i = 0; i < uids.length; i++) {
            client = this.clients[uids[i]];
            if (client) {
                client.send(msgBuf);
            }
        }
    }

    /**
     * Send messages to all clients
     * @param cmd cmd
     * @param msg message
     */
    sendAll(cmd: number, msg: any) {
        if (msg === undefined) {
            msg = null;
        }
        let data = this.protoEncode(cmd, msg);
        let uid: string;
        for (uid in this.clients) {
            this.clients[uid].send(data)
        }
    }

    /**
     * Send a message to the client
     * @param cmd   cmd
     * @param msg   message
     * @param uidsid  uidsid array
     */
    sendMsgByUidSid(cmd: number, msg: any, uidsid: { "uid": number, "sid": string }[]) {
        if (msg === undefined) {
            msg = null;
        }
        this.backendServer.sendMsgByUidSid(cmd, msg, uidsid);
    }

    /**
     * Send a message to the client
     * @param cmd   cmd
     * @param msg   message
     * @param group   { sid : uid[] }
     */
    sendMsgByGroup(cmd: number, msg: any, group: { [sid: string]: number[] }) {
        if (msg === undefined) {
            msg = null;
        }
        this.backendServer.sendMsgByGroup(cmd, msg, group);
    }

    /**
     * Configure server execution function
     * @param type  Server type:  "all" or "gate|connector" like
     * @param cb    Execution function
     */
    configure(type: string, cb: Function) {
        if (type === "all") {
            cb.call(this);
            return;
        }
        let ts = type.split("|");
        for (let i = 0; i < ts.length; i++) {
            if (this.serverType === ts[i].trim()) {
                cb.call(this);
                break;
            }
        }
    }

}
