import { EventEmitter } from "events";
import Application from "../application";
import { Session } from "../components/session";
import * as net from "net";

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
     * 是否是前端服务器
     */
    frontend?: boolean;
    /**
     * 是否是独立的
     */
    alone?: boolean;

    [key: string]: any;
}

/**
 * socket连接代理
 */
export interface SocketProxy extends EventEmitter {
    [key: string]: any;
    socket: net.Socket;
    die: boolean;
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
    serverToken: string,
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
    debug = "debug",
    info = "info",
    warn = "warn",
    error = "error"
}

/**
 * 组件名
 */
export enum componentName {
    master = "master",
    monitor = "monitor",
    frontendServer = "frontendServer",
    backendServer = "backendServer",
    remoteFrontend = "remoteFrontend",
    remoteBackend = "remoteBackend",
    rpcServer = "rpcServer",
    rpcService = "rpcService",
}

/**
 * rpc请求消息
 */
export interface rpcMsg {
    from?: string;
    to: string;
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
     * 源服务器没有目标服务器
     */
    src_has_no_end = 1,
    /**
     * 源服务器没有rpc服务器
     */
    src_has_no_rpc = 2,
    /**
     * rpc服务器没有目标服务器
     */
    rpc_has_no_end = 3,
    /**
     * rpc超时
     */
    rpc_time_out = 4
}

/**
 * 编码函数
 */
export interface encode_func {
    (cmdId: number, data: any): Buffer
}

/**
 * 解码函数
 */
export interface decode_func {
    (cmdId: number, data: Buffer, session: Session): any
}

/**
 * 前端server配置
 */
export interface connector_config {
    /**
     * socket类型
     */
    "connector": "net" | "ws",
    /**
     * 心跳（秒）
     */
    "heartbeat": number,
    /**
     * 最大连接数
     */
    "maxConnectionNum": number
}