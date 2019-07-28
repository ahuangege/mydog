/**
 * app类
 */


import * as path from "path"
import { some_config } from "./util/define";
import { ServerInfo, routeFunc, rpcRouteFunc, loggerType, connector_config, I_clientSocket, msgEncodeFunc, msgDecodeFunc, protoEncodeFunc, protoDecodeFunc, encodeDecode } from "./util/interfaceDefine";
import * as appUtil from "./util/appUtil";
import { EventEmitter } from "events";
import { RpcSocketPool } from "./components/rpcSocketPool";
import { FrontendServer } from "./components/frontendServer";
import { BackendServer } from "./components/backendServer";

declare global {
    interface Rpc {
    }
}

export default class Application extends EventEmitter {
    hasStarted: boolean = false;                                                                             // 是否已经启动
    main: string = "";                                                                                       // 启动文件
    base: string = path.dirname((require.main as any).filename);                                             // 根路径

    routeConfig: string[] = [];                                                                              // route.ts
    masterConfig: ServerInfo = {} as ServerInfo;                                                             // master.ts
    serversConfig: { [serverType: string]: ServerInfo[] } = {};                                              // servers.ts

    clientNum: number = 0;                                                                                   // 所有的socket连接数
    clients: { [uid: number]: I_clientSocket } = {};                                                         // bind了的socket
    settings: { [key: string]: any } = {};                                                                   // 用户set，get  

    servers: { [serverType: string]: ServerInfo[] } = {};                                                    // 正在运行的所有用户服务器
    serversIdMap: { [id: string]: ServerInfo } = {};                                                         // 正在运行的所有用户服务器（字典格式）

    serverToken: string = some_config.Server_Token;                                                          // 服务器内部认证密钥
    cliToken: string = some_config.Cli_Token;                                                                // master与cli的认证密匙

    serverInfo: ServerInfo = {} as ServerInfo;                                                               // 本服务器的配置
    env: "production" | "development" = "development";                                                       // 环境
    host: string = "";                                                                                       // ip
    port: number = 0;                                                                                        // port
    clientPort: number = 0;                                                                                  // clientPort
    serverId: string = "";                                                                                   // 服务器名字id， 服务器唯一标识
    serverType: string = "";                                                                                 // 服务器类型
    frontend: boolean = false;                                                                               // 是否是前端服务器
    startMode: "all" | "alone" = "all";                                                                      // 启动方式  all / alone
    startTime: number = 0;                                                                                   // 启动时刻

    router: { [serverType: string]: routeFunc } = {};                                                        // 路由消息到后端时的前置选择
    rpc: (serverId: string) => Rpc = null as any;               // rpc包装
    rpcPool: RpcSocketPool = new RpcSocketPool();                                                            // rpc socket pool

    logger: (level: loggerType, msg: string) => void = function () { };                                      // 内部日志输出口

    encodeDecodeConfig: encodeDecode = {} as any;                                                            // 编码解码函数
    msgEncode: msgEncodeFunc = null as any;
    msgDecode: msgDecodeFunc = null as any;
    protoEncode: protoEncodeFunc = null as any;
    protoDecode: protoDecodeFunc = null as any;
    connectorConfig: connector_config = {} as any;                                                           // 前端connector配置
    rpcConfig: { "timeout": number, "maxLen": number } = {} as any;                                          // rpc配置
    frontendServer: FrontendServer = null as any;
    backendServer: BackendServer = null as any;

    constructor() {
        super();
        appUtil.defaultConfiguration(this);
    }

    /**
     * 启动
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

    /**
     * 配置编码解码函数
     * @param config 
     */
    setEncodeDecodeConfig(config: encodeDecode): void {
        this.encodeDecodeConfig = config;
    }

    /**
     * 配置前端server参数
     * @param config 
     */
    setConnectorConfig(config: connector_config) {
        this.connectorConfig = config;
    }

    /**
     * 配置rpc参数
     * @param config 
     */
    setRpcConfig(config: { "timeout": number, "maxLen": number }) {
        this.rpcConfig = config;
    }

    /**
     * 设置键值对
     */
    set(key: string | number, value: any) {
        this.settings[key] = value;
        return value;
    }

    /**
     * 获取键key对应的值
     */
    get(key: string | number) {
        return this.settings[key];
    }

    /**
     * 删除某一个键值对
     */
    delete(key: string | number) {
        delete this.settings[key];
    }


    /**
     * 根据服务器类型获取服务器数组
     */
    getServersByType(serverType: string) {
        return this.servers[serverType] || [];
    }

    /**
     * 获取某一个服务器配置
     */
    getServerById(serverId: string) {
        return this.serversIdMap[serverId];
    }

    /**
     * 路由配置 (决定前端调用哪个后端)      》前端专用
     * @param serverType 后端服务器类型
     * @param routeFunc 配置函数
     */
    route(serverType: string, routeFunc: routeFunc) {
        if (typeof routeFunc !== "function") {
            console.error("app.route() --- cb must be a function");
            return;
        }
        this.router[serverType] = routeFunc;
    }

    /**
     * 是否有绑定的客户端     》前端专用
     */
    hasClient(uid: number) {
        return !!this.clients[uid];
    }

    /**
     * 关闭绑定的客户端       》前端专用
     */
    closeClient(uid: number) {
        let client = this.clients[uid];
        if (client) {
            client.close();
        }
    }

    /**
     * 配置部分session         》前端专用
     */
    applySession(uid: number, some: any) {
        let client = this.clients[uid];
        if (client) {
            client.session.setSome(some);
        }
    }

    /**
     * 向客户端发送消息            》前端专用
     * @param cmd   路由
     * @param msg   消息
     * @param uids  uid数组 [1,2]
     */
    sendMsgByUid(cmd: string, msg: any, uids: number[]) {
        if (!this.frontend) {
            console.error("app.sendMsgByUid() --- backend server cannot use this method");
            return;
        }
        let cmdIndex = this.routeConfig.indexOf(cmd);
        if (cmdIndex === -1) {
            console.error("app.sendMsgByUid() --- no such route : " + cmd);
            return;
        }
        if (msg === undefined) {
            msg = null;
        }
        let msgBuf = this.protoEncode(cmdIndex, msg);
        let client: I_clientSocket;
        for (let i = 0; i < uids.length; i++) {
            client = this.clients[uids[i]];
            if (client) {
                client.send(msgBuf);
            }
        }
    }

    /**
     * 向所有客户端发送消息      》前端专用
     * @param cmd 路由
     * @param msg 消息
     */
    sendAll(cmd: string, msg: any) {
        if (!this.frontend) {
            console.error("app.sendAll() --- backend server cannot use this method");
            return;
        }
        let cmdIndex = this.routeConfig.indexOf(cmd);
        if (cmdIndex === -1) {
            console.error("app.sendAll() --- no such route : " + cmd);
            return;
        }
        if (msg === undefined) {
            msg = null;
        }
        let data = this.protoEncode(cmdIndex, msg);
        for (let uid in this.clients) {
            this.clients[uid].send(data)
        }
    }

    /**
     * 向客户端发送消息     》后端专用
     * @param cmd   路由
     * @param msg   消息
     * @param uidsid  uidsid 数组
     */
    sendMsgByUidSid(cmd: string, msg: any, uidsid: { "uid": number, "sid": string }[]) {
        if (this.frontend) {
            console.error("app.sendMsgByUidSid() --- frontend server cannot use this method");
            return;
        }
        let cmdIndex = this.routeConfig.indexOf(cmd);
        if (cmdIndex === -1) {
            console.error("app.sendMsgByUidSid() --- no such route : " + cmd);
            return;
        }
        if (msg === undefined) {
            msg = null;
        }
        this.backendServer.sendMsgByUidSid(cmdIndex, msg, uidsid);
    }

    /**
     * 配置服务器执行函数
     * @param type  服务器类型  "all"或者"gate|connector"形式
     * @param cb    执行函数
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

    /**
     * 设置内部日志输出
     * @param cb  回调函数
     */
    onLog(cb: (level: loggerType, msg: string) => void) {
        if (typeof cb !== "function") {
            console.error("app.onLog() --- cb must be a function");
            return;
        }
        this.logger = cb;
    }


    /**
     * 获取bind的socket连接数
     */
    getBindClientNum() {
        return Object.keys(this.clients).length;
    }
}