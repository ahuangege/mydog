

/**
 * 
 * 官网: https://www.mydog.wiki
 * 版本: 2.3.0
 * 
 */

/**
 * 创建 app
 */
export function createApp(): Application;

/**
 * 被创建的 app
 */
export let app: Application;

/**
 * mydog 版本号
 */
export let version: string;

/**
 * 两种内置的 connector
 */
export let connector: {
    Tcp: I_connectorConstructor,
    Ws: I_connectorConstructor,
}

/**
 * app 类
 */
export interface Application {

    /**
     * app 名字
     */
    appName: string;

    /**
     * 项目根路径
     */
    readonly base: string;

    /**
     * 启动环境
     */
    readonly env: string;

    /**
     * 服务器 id
     */
    readonly serverId: string;

    /**
     * 服务器类型
     */
    readonly serverType: string;

    /**
     * 本服务器的配置
     */
    readonly serverInfo: ServerInfo;

    /**
     * 配置： route.ts
     */
    readonly routeConfig: string[];

    /**
     * 配置： master.ts
     */
    readonly masterConfig: ServerInfo;

    /**
     * 配置： servers.ts
     */
    readonly serversConfig: { [serverType: string]: ServerInfo[] };

    /**
     * 服务器启动时刻
     */
    readonly startTime: number;

    /**
     * 所有的客户端socket连接数 （前端服调用）
     */
    readonly clientNum: number;

    /**
     * rpc 调用，回调形式
     */
    readonly rpc: (serverId: string) => Rpc;

    /**
     * rpc 调用， await 形式
     * @param serverId 服务器id
     * @param notify 是否是通知类消息 （默认false）
     */
    readonly rpcAwait: (serverId: string, notify?: boolean) => Rpc;

    /**
     * 启动服务器
     */
    start(): void;

    /**
     * rpc 配置
     */
    setConfig(key: "rpc", value: I_rpcConfig): void;
    /**
     * connector 配置
     */
    setConfig(key: "connector", value: I_connectorConfig): void;
    /**
     * 编码解码配置
     */
    setConfig(key: "encodeDecode", value: I_encodeDecodeConfig): void;
    /**
     * ssh 配置
     */
    setConfig(key: "ssh", value: string[]): void;
    /**
     * 认证密钥配置
     */
    setConfig(key: "recognizeToken", value: I_recognizeTokenConfig): void;
    /**
     * 框架日志输出
     */
    setConfig(key: "logger", value: (type: "frame" | "msg", level: "info" | "warn" | "error", msg: string) => void): void;
    /**
     * 自定义监控
     */
    setConfig(key: "mydogList", value: () => { "title": string, "value": string }[]): void;

    /**
     * 设置键值对
     */
    set<T = any>(key: string | number, value: T): T

    /**
     * 获取键值对
     */
    get<T = any>(key: string | number): T;

    /**
     * 删除键值对
     */
    delete(key: string | number): void;

    /**
     * 获取某一类服务器
     */
    getServersByType(serverType: string): ServerInfo[];

    /**
     * 获取某一个服务器
     */
    getServerById(serverId: string): ServerInfo;

    /**
     * 路由配置 （前端服调用）
     */
    route(serverType: string, routeFunc: (session: Session) => string): void;

    /**
     * 获取客户端session （前端服调用）
     */
    getSession(uid: number): Session;

    /** 
     * 获取所有客户端
     */
    getAllClients(): { [uid: number]: I_clientSocket };

    /**
     * 向客户端发送消息 （前端服调用）
     */
    sendMsgByUid(cmd: number, msg: any, uids: number[]): void;

    /**
     * 向本服的所有客户端发送消息 （前端服调用）
     */
    sendAll(cmd: number, msg: any): void;

    /**
     * 向客户端发送消息 （后端服调用）
     */
    sendMsgByUidSid(cmd: number, msg: any, uidsid: { "uid": number, "sid": string }[]): void;

    /**
     * 向客户端发送消息 （后端服调用）
     */
    sendMsgByGroup(cmd: number, msg: any, group: { [sid: string]: number[] }): void;

    /**
     * 配置服务器执行函数
     * @param type 服务器类型， "all" 或者 "gate|connector" 形式
     * @param cb 执行函数
     */
    configure(type: string, cb: () => void): void;

    /**
     * 监听事件 （添加服务器，移除服务器）
     */
    on(event: "onAddServer" | "onRemoveServer", cb: (serverInfo: ServerInfo) => void): void;

}

/**
 * Session 类
 */
export interface Session {
    /**
     * 绑定的 uid
     */
    readonly uid: number;

    /**
     * 前端服务器 id
     */
    readonly sid: string;

    /**
     * 设置键值对
     */
    set(value: { [key: string]: any }): void;

    /**
     * 获取键值对
     */
    get<T = any>(key: number | string): T;

    /**
     * 删除键值对
     */
    delete(keys: (number | string)[]): void;

    /**
     * 设置键值对（本地）
     */
    setLocal(key: number | string, value: any): void;

    /**
     * 获取键值对（本地）
     */
    getLocal<T = any>(key: number | string): T;

    /**
     * 删除键值对（本地）
     */
    deleteLocal(key: number | string): void;

    /**
     * 绑定uid （前端服调用）
     */
    bind(uid: number): boolean;

    /**
     * 关闭连接 （前端服调用）
     */
    close(): void;

    /**
     * 将后端 session 同步到前端 （后端服调用）
     */
    apply(): void;

    /**
     * 获取ip （前端服调用）
     */
    getIp(): string;

}

/**
 * 服务器信息
 */
export interface ServerInfo {
    /**
     * 服务器 id
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
     * 是否是前端服
     */
    readonly frontend: boolean;
    /**
     * clientPort
     */
    readonly clientPort: number;
    /**
     * 服务器类型 （注：由框架内部赋值）
     */
    readonly serverType: string;

    [key: string]: any;
}

/**
 * rpc 接口
 */
declare global {
    interface Rpc {
    }
}

/**
 * rpc 调用，内部错误码
 */
export const enum rpcErr {
    /**
     * 成功
     */
    ok = 0,
    /**
     * 没有目标服务器
     */
    noServer = 1,
    /**
     * rpc 超时
     */
    timeout = 2
}

/**
 * 编码解码配置
 */
interface I_encodeDecodeConfig {
    /**
     * 协议编码
     */
    "protoEncode"?: (cmd: number, msg: any) => Buffer,
    /**
     * 消息编码
     */
    "msgEncode"?: (cmd: number, msg: any) => Buffer,
    /**
     * 协议解码
     */
    "protoDecode"?: (data: Buffer) => { "cmd": number, "msg": Buffer },
    /**
     * 消息解码
     */
    "msgDecode"?: (cmd: number, msg: Buffer) => any,
}


/**
 * connector 配置
 */
interface I_connectorConfig {
    /**
     * 自定义connector （默认tcp）
     */
    "connector"?: I_connectorConstructor,
    /**
     * 心跳（秒，默认无）
     */
    "heartbeat"?: number,
    /**
     * 最大连接数（默认无限制）
     */
    "maxConnectionNum"?: number,
    /**
     * 消息包最大长度（默认 10 MB）
     */
    "maxLen"?: number
    /**
     * 是否开启Nagle算法（默认不开启）
     */
    "noDelay"?: boolean,
    /**
     * 消息发送频率（毫秒，大于 10 则启用，默认立即发送）
     */
    "interval"?: number,
    /**
     * 客户端连接通知
     */
    "clientOnCb"?: (session: Session) => void,
    /**
     * 客户端离开通知
     */
    "clientOffCb"?: (session: Session) => void,
    /**
     * 消息过滤。返回true，则该消息会被丢弃。
     */
    "cmdFilter"?: (session: Session, cmd: number) => boolean,

    [key: string]: any,
}

/**
 * rpc 配置
 */
interface I_rpcConfig {
    /**
     * 超时时间（秒，大于 5 则使用，默认 10）
     */
    "timeout"?: number,
    /**
     * 消息包最大长度（默认 10 MB）
     */
    "maxLen"?: number,
    /**
     * 消息发送频率（毫秒，大于 10 则启用，默认立即发送）
     */
    "interval"?: number | { "default": number, [serverType: string]: number }
    /**
     * 是否开启Nagle算法（默认不开启）
     */
    "noDelay"?: boolean,
    /**
     * 心跳（秒，大于 5 则使用，默认 60）
     */
    "heartbeat"?: number,
    /**
     * 重连间隔（秒，默认 2）
     */
    "reconnectDelay"?: number,
    /**
     * 不建立socket连接的矩阵
     */
    "noRpcMatrix"?: { [serverType: string]: string[] }
}

/**
 * 认证密钥配置
 */
interface I_recognizeTokenConfig {
    /**
     * 服务器内部认证密钥
     */
    "serverToken"?: string,
    /**
     * master与cli的认证密钥
     */
    "cliToken"?: string,
}

/**
 * 自定义 connector
 */
export interface I_connectorConstructor {
    new(info: { app: Application, clientManager: I_clientManager, config: I_connectorConfig, startCb: () => void }): void;
}

/**
 * 客户端socket管理
 */
export interface I_clientManager {
    addClient(client: I_clientSocket): void;
    handleMsg(client: I_clientSocket, msg: Buffer): void;
    removeClient(client: I_clientSocket): void;
}

/**
 * 客户端socket
 */
export interface I_clientSocket {
    /**
     * session （注：框架内部赋值）
     */
    readonly session: Session;

    /**
     * ip（session是从这里拿到的ip）
     */
    remoteAddress: string;

    /**
     * 发送消息
     */
    send(msg: Buffer): void;

    /**
     * 关闭
     */
    close(): void;
}
