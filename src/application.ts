/**
 * app类
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
    appName: string = "hello world";                                                                         // 应用名称
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

    serverInfo: ServerInfo = {} as ServerInfo;                                                               // 本服务器的配置
    isDaemon: boolean = false;                                                                               // 是否后台运行
    env: string = "";                                                                                        // 环境
    serverId: string = "";                                                                                   // 服务器名字id， 服务器唯一标识
    serverType: string = "";                                                                                 // 服务器类型
    frontend: boolean = false;                                                                               // 是否是前端服务器
    startMode: "all" | "alone" = "all";                                                                      // 启动方式  all / alone
    startTime: number = 0;                                                                                   // 启动时刻

    router: { [serverType: string]: (session: Session) => string } = {};                                                        // 路由消息到后端时的前置选择
    rpc: (serverId: string) => Rpc = null as any;                                                            // rpc包装
    rpcPool: RpcSocketPool = new RpcSocketPool();                                                            // rpc socket pool

    logger: (level: loggerType, msg: string) => void = function () { };                                      // 内部日志输出口

    msgEncode: Required<I_encodeDecodeConfig>["msgEncode"] = null as any;
    msgDecode: Required<I_encodeDecodeConfig>["msgDecode"] = null as any;
    protoEncode: Required<I_encodeDecodeConfig>["protoEncode"] = null as any;
    protoDecode: Required<I_encodeDecodeConfig>["protoDecode"] = null as any;

    someconfig: I_someConfig = {} as any;   // 部分开放的配置
    serverTypeSocketOffConfig: { [svrT_svrT: string]: boolean } = {};       // 服务器间不建立socket连接的配置
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


    setConfig(key: "rpc", value: I_rpcConfig): void
    setConfig(key: "connector", value: I_connectorConfig): void
    setConfig(key: "encodeDecode", value: Partial<I_encodeDecodeConfig>): void
    setConfig(key: "ssh", value: string[]): void
    setConfig(key: "recognizeToken", value: { "serverToken"?: string, "cliToken"?: string }): void
    setConfig(key: "serverTypeSocketOff", value: { [serverType: string]: string[] }): void
    setConfig(key: "logger", value: (level: loggerType, msg: string) => void): void
    setConfig(key: "mydogList", value: () => { "title": string, "value": string }[]): void
    setConfig(key: keyof I_someConfig, value: any): void {
        this.someconfig[key] = value;
        if (key === "logger") {
            this.logger = value;
        } else if (key === "serverTypeSocketOff") {
            for (let svrT1 in value) {
                let arr = value[svrT1];
                for (let svrT2 of arr) {
                    this.serverTypeSocketOffConfig[appUtil.getServerTypeSocketOffKey(svrT1, svrT2)] = true;
                }
            }
        }
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
     * 路由配置 (决定前端调用哪个后端)
     * @param serverType 后端服务器类型
     * @param routeFunc 配置函数
     */
    route(serverType: string, routeFunc: (session: Session) => string) {
        this.router[serverType] = routeFunc;
    }

    /**
     * 是否有绑定的客户端
     */
    hasClient(uid: number) {
        return !!this.clients[uid];
    }

    /**
     * 关闭绑定的客户端
     */
    closeClient(uid: number) {
        let client = this.clients[uid];
        if (client) {
            client.close();
        }
    }

    /**
     * 配置部分session
     */
    applySession(uid: number, some: { [key: string]: any }) {
        let client = this.clients[uid];
        if (client) {
            client.session.set(some);
        }
    }

    /**
     * 向客户端发送消息
     * @param cmd   路由
     * @param msg   消息
     * @param uids  uid数组 [1,2]
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
     * 向所有客户端发送消息
     * @param cmd 路由
     * @param msg 消息
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
     * 向客户端发送消息
     * @param cmd   路由
     * @param msg   消息
     * @param uidsid  uidsid 数组
     */
    sendMsgByUidSid(cmd: number, msg: any, uidsid: { "uid": number, "sid": string }[]) {
        if (msg === undefined) {
            msg = null;
        }
        this.backendServer.sendMsgByUidSid(cmd, msg, uidsid);
    }

    /**
     * 向客户端发送消息
     * @param cmd   路由
     * @param msg   消息
     * @param group   { sid : uid[] }
     */
    sendMsgByGroup(cmd: number, msg: any, group: { [sid: string]: number[] }) {
        if (msg === undefined) {
            msg = null;
        }
        this.backendServer.sendMsgByGroup(cmd, msg, group);
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

}
