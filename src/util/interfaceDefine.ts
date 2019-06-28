import { EventEmitter } from "events";
import Application from "../application";
import { Session } from "../components/session";

/**
 * 服务器配置
 */
export interface ServerInfo {
    /**
     * 服务器id
     */
    id: string;
    /**
     * host
     */
    host: string;
    /**
     * port
     */
    port: number;
    /**
     * clientPort
     */
    clientPort?: number;
    /**
     * 是否是前端服务器
     */
    frontend?: boolean;


    [key: string]: any;
}

/**
 * socket连接代理
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
 * monitor收到master的新增服务器信息格式
 */
export interface monitor_get_new_server {
    "T": number;
    "serverInfoIdMap": { [id: string]: { "serverType": string, "serverInfo": ServerInfo } };
}

/**
 * monitor收到master的移除服务器信息格式
 */
export interface monitor_remove_server {
    "T": number;
    "id": string;
    "serverType": string;
}

/**
 * monitor向master注册时的消息格式
 */
export interface monitor_reg_master {
    T: number,
    serverType: string,
    serverToken?: string,
    cliToken?: string,
    serverInfo: ServerInfo
}

/**
 * 前端到后端消息的路由函数
 */
export interface routeFunc {
    (app: Application, session: Session, serverType: string, cb: (serverId: string) => void): void;
}

/**
 * rpc路由函数
 */
export interface rpcRouteFunc {
    (app: Application, routeParam: any, cb: (serverId: string) => void): void;
}

/**
 * 后端同步到前端的session
 */
export interface sessionApplyJson {
    uid: number;
    sid: string;
    settings: { [key: string]: any };
}

/**
 * 内部框架日志级别
 */
export enum loggerType {
    info = "info",
    warn = "warn",
    error = "error"
}


/**
 * rpc消息导向包（1、有route有id表示收到消息且需回调。2、有route无id表示收到消息无需回调。3、无route有id表示是回调的消息）
 */
export interface rpcMsg {
    route?: string;
    id?: number;
}

/**
 * rpc请求超时
 */
export interface rpcTimeout {
    id: number;
    cb: Function;
    timer: NodeJS.Timeout;
}

/**
 * rpc调用，内部错误码
 */
export const enum rpcErr {
    /**
     * 没有目标服务器
     */
    noServer = 1,
    /**
     * rpc超时
     */
    timeout = 2
}


/**
 * 编码解码
 */
export interface encodeDecode {
    "protoEncode": protoEncodeFunc,
    "msgEncode": msgEncodeFunc,
    "protoDecode": protoDecodeFunc,
    "msgDecode": msgDecodeFunc
}


/**
 * 协议编码函数
 */
export interface protoEncodeFunc {
    (cmdId: number, msg: any): Buffer
}
/**
 * 消息编码函数
 */
export interface msgEncodeFunc {
    (cmdId: number, msg: any): Buffer
}

/**
 * 协议解码函数
 */
export interface protoDecodeFunc {
    (data: Buffer): { "cmdId": number, "msg": Buffer }
}
/**
 * 消息解码函数
 */
export interface msgDecodeFunc {
    (cmdId: number, msg: Buffer): any
}


/**
 * 前端connector配置
 */
export interface connector_config {
    /**
     * connector构造器
     */
    "connector": I_connectorConstructor,
    /**
     * 心跳（秒）
     */
    "heartbeat": number,
    /**
     * 最大连接数
     */
    "maxConnectionNum": number,
    /**
     * 消息包最大长度
     */
    "maxLen": number
}

/**
 * 连接用户的socket管理代理
 */
export interface I_clientManager {
    addClient(client: I_clientSocket): void;
    handleMsg(client: I_clientSocket, msg: Buffer): void;
    removeClient(client: I_clientSocket): void;
}

/**
 * 连接服构造函数
 */
export interface I_connectorConstructor {
    new(info: { app: Application, clientManager: I_clientManager, config: { "route": string[], "heartbeat": number, "maxLen": number }, startCb: () => void }): void;
}

/**
 * 每个用户的socket
 */
export interface I_clientSocket {
    session: Session;
    remoteAddress: string;
    send(msg: Buffer): void;
    close(): void;
}
