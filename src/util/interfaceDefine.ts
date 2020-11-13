import { EventEmitter } from "events";
import { I_connectorConfig, I_encodeDecodeConfig, I_rpcConfig, ServerInfo } from "../..";
import Application from "../application";
import { Session } from "../components/session";

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
 * 前端复制到后端的的session
 */
export interface sessionCopyJson {
    uid: number;
    sid: string;
    settings: { [key: string]: any };
}

/**
 * 内部框架日志级别
 */
export const enum loggerType {
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
    cb: Function;
    time: number;
}


export interface I_someConfig {
    "rpc": I_rpcConfig,             // rpc配置
    "connector": I_connectorConfig, // 前端connector连接服配置
    "encodeDecode": I_encodeDecodeConfig,   // 编码解码配置
    "ssh": string[],                // ssh配置
    "recognizeToken": { "serverToken": string, "cliToken": string },    // 认证密钥
    "logger": (level: loggerType, msg: string) => void,           // 内部日志输出
    "mydogList": () => { "title": string, "value": string }[],      // 自定义监控
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
    new(info: { app: Application, clientManager: I_clientManager, config: I_connectorConfig, startCb: () => void }): void;
}

/**
 * 每个用户的socket
 */
export interface I_clientSocket {
    session: Session;
    send(msg: Buffer): void;
    close(): void;
}
