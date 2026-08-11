

/**
 * 
 * 官网: https://www.mydog.wiki
 * 版本: 3.0.0
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

    /**
     * tcp socket
     */
    Tcp: I_connectorConstructor,

    /**
     * websocket
     */
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
     * 启动服务器
     */
    start(): void;

    /**
     * rpc 调用
     */
    rpc(serverId: string, notify?: boolean): Rpc;

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
    setConfig(key: "logger", value: (level: "debug" | "info" | "error", msg: string | Error) => void): void;
    /**
     * 自定义监控
     */
    setConfig(key: "mydogList", value: () => { "title": string, "value": string }[]): void;
    /**
     * 服务器关闭回调
     */
    setConfig(key: "onBeforeExit", value: () => Promise<void>): void;
    /**
     * session 配置
     */
    setConfig(key: "session", value: I_sessionConfig): void;
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
    route(serverType: string, routeFunc: (session: Session, cmd: number) => string): void;

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
     * 消息处理前的一些前置工作
     */
    before(filter: { "before": (cmd: number, msg: any, session: Session) => Promise<boolean> }): void;

    /**
     * 消息处理后的一些后置工作
     */
    after(filter: { "after": (cmd: number, msg: any, session: Session) => Promise<boolean> }): void;

    /**
     * 消息刚达到网关服时的一些处理
     */
    globalBefore(filter: { "globalBefore": (info: { cmd: number, msg: Buffer }, session: Session) => Promise<boolean> }): void;

    /**
     * 添加或更新服务器信息
     */
    addServer(info: ServerInfo): void;

    /**
     * 移除服务器
     */
    removeServer(sid: string): void;

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
     * 获取ip （前端服调用）
     */
    getIp(): string;

    /**
     * 向客户端发送消息 （前端服调用）
     */
    send(cmd: number, msg: any): void;
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
     * 服务器类型 （注:框架内部赋值）
     */
    serverType: string;

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
 * 编码解码配置
 */
export interface I_encodeDecodeConfig {
    /**
     * 协议编码
     */
    "protoEncode"?: (cmd: number, msg: any) => { "head": Buffer, "msg": Buffer },
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
export interface I_connectorConfig {
    /**
     * 自定义connector （默认tcp）
     */
    "connector"?: I_connectorConstructor,
    /**
     * 心跳（秒，默认无）
     */
    "heartbeat"?: number,
    /**
     * 最大连接数（默认2000）
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
     * 消息发送频率（毫秒，默认 33 毫秒）
     */
    "interval"?: number,
    /**
     * 因为定时发送，为防止单次Buffer申请过大，可配置此值作为立即发送的阈值（默认 32 KB）
     */
    "intervalCacheLen"?: number,
    /**
     * 客户端连接通知
     */
    "clientOnCb"?: (session: Session) => void,
    /**
     * 客户端离开通知
     */
    "clientOffCb"?: (session: Session) => void,

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
     * 消息发送频率（毫秒， 默认 33 毫秒）
     */
    "interval"?: number | { "default": number, [serverType: string]: number }
    /**
     * 因为固定间隔发送，为防止单次Buffer申请过大，可配置此值作为立即发送的阈值（默认 32 KB）
     */
    "intervalCacheLen"?: number,
    /**
     * 是否开启Nagle算法（默认不开启）
     */
    "noDelay"?: boolean,
    /**
     * 心跳（秒，大于 5 则使用，默认 60）
     */
    "heartbeat"?: number,
    /**
     * 不建立socket连接的矩阵
     */
    "noRpcMatrix"?: { [serverType: string]: string[] },
    /**
     * rpc 全局消息缓存最大个数（默认 50000）
     */
    "rpcMsgCacheCount"?: number,
    /**
     * Rpc 全局消息缓存最大字节数（默认 64 MB）
     */
    "rpcMsgCacheSize"?: number,
    /**
     * rpc socket 建立每秒并发个数（默认 20）
     */
    "socketPerSecond"?: number,
    /**
     * rpc 错误时是否打印原始堆栈 （QPS 过高时会影响性能，可以开发环境开启，生产环境关闭）
     */
    "errStack"?: boolean
}

/**
 * 认证密钥配置
 */
interface I_recognizeTokenConfig {
    /**
     * 是否使用内部 monitor -> master 服务发现 （默认使用）
     */
    "useMonitor"?: boolean,
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
 * session 配置
 */
interface I_sessionConfig {
    /**
     * 不需要同步 session 的后端服务器类型（默认同步。 不同步时只有 uid sid 可用）
     */
    "noNeedSyncServerTypes"?: string[],
    /**
     * 后端 session 缓存时长（秒。 默认 15秒）
     */
    "expireSeconds"?: number,
    /**
     * 后端 session 缓存最大个数（默认3000）
     */
    "maxCacheCount"?: number
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
    /** 
     * 将客户端注册到框架中 
     */
    addClient(client: I_clientSocket): void;
    /**
     * 处理客户端消息
     */
    handleMsg(client: I_clientSocket, msg: Buffer): void;
    /**
     * 从框架中移除该客户端
     */
    removeClient(client: I_clientSocket): void;
}

/**
 * 客户端socket
 */
export interface I_clientSocket {
    /**
     * session （注意：框架内部赋值）
     */
    session: Session;
    /**
     * ip（session是从这里拿到的ip）
     */
    remoteAddress: string;
    /**
     * 发送消息（注意，msg 和 msg2 加起来才是一个完整包）
     */
    send(msg: Buffer, msg2?: Buffer): void;
    /**
     * 关闭
     */
    close(): void;
}
