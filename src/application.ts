/**
 * app类
 */


import * as path from "path"
import { some_config } from "./util/define";
import { ServerInfo, routeFunc, rpcRouteFunc, loggerType, componentName, encode_func, decode_func, connector_config } from "./util/interfaceDefine";
import { Session } from "./components/session";
import * as RemoteFrontend from "./components/remoteFrontend";
import * as remoteBackend from "./components/remoteBackend";
import * as RpcService from "./components/rpcService";
import { encodeClientData } from "./components/msgCoder";
import * as appUtil from "./util/appUtil";
import { EventEmitter } from "events";
let hasStarted = false; // 是否已经启动

declare global {
    interface Rpc {
    }
}

export default class Application extends EventEmitter {

    main: string = "";                                                                                       // 启动文件
    base: string = path.dirname((require.main as any).filename);                                             // 根路径

    routeConfig: string[] = [];                                                                              // route.ts
    masterConfig: ServerInfo = {} as ServerInfo;                                                             // master.ts
    rpcServersConfig: ServerInfo[] = [];                                                                     // rpc.ts
    serversConfig: { [serverType: string]: ServerInfo[] } = {};                                              // servers.ts

    clientNum: number = 0;                                                                                   // 所有的socket连接数
    clients: { [uid: number]: Session } = {};                                                                // bind了的socket
    settings: { [key: string]: any } = {};                                                                   // 用户set，get  

    servers: { [serverType: string]: ServerInfo[] } = {};                                                    // 正在运行的所有用户服务器
    serversIdMap: { [id: string]: ServerInfo } = {};                                                         // 正在运行的所有用户服务器（字典格式）
    rpcServersIdMap: { [id: string]: ServerInfo } = {};                                                      // 正在运行的所有rpc服务器（字典格式）

    serverToken: string = some_config.Server_Token;                                                          // 服务器内部认证密钥
    clientToken: string = some_config.Master_Client_Token;                                                   // master与cli的认证密匙

    serverInfo: ServerInfo = {} as ServerInfo;                                                               // 本服务器的配置
    env: "production" | "development" = "development";                                                       // 环境
    host: string = "";                                                                                       // ip
    port: number = 0;                                                                                        // port
    serverId: string = "";                                                                                   // 服务器名字id， 服务器唯一标识
    serverType: string = "";                                                                                 // 服务器类型
    frontend: boolean = false;                                                                               // 是否是前端服务器
    alone: boolean = false;                                                                                  // 是否是单独的
    startMode: "all" | "alone" = "all";                                                                      // 启动方式  all / alone
    startTime: number = 0;                                                                                   // 启动时刻

    router: { [serverType: string]: routeFunc } = {};                                                        // 路由消息到后端时的前置选择
    rpcRouter: { [serverType: string]: rpcRouteFunc } = {};                                                  // rpc消息时的前置选择
    rpc: { route: (routeParam: any) => Rpc, toServer: (serverId: string) => Rpc } = {} as any;               // rpc包装

    logger: (level: loggerType, componentName: componentName, msg: any) => void = function () { };           // 内部日志输出口

    encodeDecodeConfig: { "encode": encode_func, "decode": decode_func } = {} as any;                        // 编码解码函数
    connectorConfig: connector_config = {} as any;                                                           // 前端server配置
    rpcConfig: { "timeOut": number } = {} as any;                                                            // rpc配置

    constructor() {
        super();
        appUtil.defaultConfiguration(this);
    }

    /**
     * 启动
     */
    start() {
        if (hasStarted) {
            console.error("the app has already started");
            return;
        }
        hasStarted = true;
        this.startTime = new Date().getTime();
        appUtil.startServer(this);
    }

    /**
     * 配置编码解码函数
     * @param config 
     */
    set_encodeDecodeConfig(config: { "encode": encode_func, "decode": decode_func }): void {
        this.encodeDecodeConfig = config;
    }

    /**
     * 配置前端server参数
     * @param config 
     */
    set_connectorConfig(config: connector_config) {
        this.connectorConfig = config;
    }

    /**
     * 配置rpc参数
     * @param config 
     */
    set_rpcConfig(config: { "timeOut": number }) {
        this.rpcConfig = config;
    }

    /**
     * 设置键值对
     */
    set(key: string | number, value: any) {
        this.settings[key] = value;
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
        return this.servers[serverType];
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
     * rpc路由配置
     * @param serverType 接收消息的服务器类型
     * @param routeFunc 配置函数
     */
    rpcRoute(serverType: string, rpcRouteFunc: rpcRouteFunc) {
        if (typeof rpcRouteFunc !== "function") {
            console.error("app.rpcRoute() --- cb must be a function");
            return;
        }
        this.rpcRouter[serverType] = rpcRouteFunc;
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
            client.socket.close();
        }
    }

    /**
     * 配置部分session         》前端专用
     */
    applySession(uid: number, some: any) {
        let client = this.clients[uid];
        if (client) {
            client.setSome(some);
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
        let msgBuf = encodeClientData(cmdIndex, msg);
        let client: Session;
        for (let i = 0; i < uids.length; i++) {
            client = this.clients[uids[i]];
            if (client) {
                client.socket.send(msgBuf);
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
        let data = encodeClientData(cmdIndex, msg);
        for (let uid in this.clients) {
            this.clients[uid].socket.send(data)
        }
    }

    /**
     * 向客户端发送消息     》后端专用
     * @param cmd   路由
     * @param msg   消息
     * @param uids  uid数组 [1,2]
     * @param sids  sid数组 ["connector-server-1", "connector-server-2"]
     */
    sendMsgByUidSid(cmd: string, msg: any, uids: number[], sids: string[]) {
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
        remoteBackend.sendMsgByUidSid(cmdIndex, msg, uids, sids);
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
    onLog(cb: (level: loggerType, comName: componentName, msg: any) => void) {
        if (typeof cb !== "function") {
            console.error("app.onLog() --- cb must be a function");
            return;
        }
        this.logger = cb;
    }

    /**
     * 加载模块
     * @param dir  相对根目录的路径
     * @returns
     */
    loadFile(dir: string) {
        dir = path.join(this.base, dir);
        return require(dir)
    }

    /**
     * 获取bind的socket连接数
     */
    getBindClientNum() {
        return Object.keys(this.clients).length;
    }
}