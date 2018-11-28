
/**
 * 创建 app
 */
export function createApp(): Application;

/**
 * 被创建的app
 */
export let app: Application;

/**
 * mydog版本
 */
export let version: string;

/**
 * app 类
 */
export interface Application {

    /**
     * route.json
     */
    readonly routeConfig: string[];

    /**
     * master.json
     */
    readonly masterConfig: ServerInfo;

    /**
     * rpc.json
     */
    readonly rpcServersConfig: ServerInfo[];

    /**
     * servers.json
     */
    readonly serversConfig: { readonly [serverType: string]: ServerInfo[] };

    /**
     * 前端服务器，所有的socket连接数
     */
    readonly clientNum: number;

    /**
     * 服务器信息
     */
    readonly servers: { readonly [serverType: string]: ServerInfo[] };

    /**
     * 服务器信息（id格式）
     */
    readonly serversIdMap: { readonly [id: string]: ServerInfo };

    /**
     * rpc服务器信息
     */
    readonly rpcServersIdMap: { readonly [id: string]: ServerInfo };

    /**
     * 服务器内部认证密钥
     */
    serverToken: string;

    /**
     * master与cli的认证密匙
     */
    clientToken: string;

    /**
     * 本服务器的配置
     */
    readonly serverInfo: ServerInfo;

    /**
     * env
     */
    readonly env: "production" | "development";

    /**
     * ip
     */
    readonly host: string;

    /**
     * port
     */
    readonly port: number;

    /**
     * 服务器id
     */
    readonly serverId: string;

    /**
     * 服务器类型
     */
    readonly serverType: string;

    /**
     * 是否是前端服务器
     */
    readonly frontend: boolean;

    /**
     * 服务器启动时刻
     */
    readonly startTime: number;

    /**
     * rpc集合
     */
    readonly rpc: {
        /**
         * 指定服务器id
         */
        toServer: (serverId: string) => Rpc

        /**
         * 通过rpcRoute路由
         */
        route: (routeParam: any) => Rpc,
    };

    /**
     * 服务器启动
     */
    start(): void;

    /**
     * 编码解码回调
     */
    set(key: "encodeDecodeConfig", value: { "encode": Function, "decode": Function }): void
    /**
     * 前端连接服务器配置
     */
    set(key: "connectorConfig", value: { "connector": "net" | "ws", "heartbeat": number, "maxConnectionNum": number }): void

    /**
     * 设置键值对
     * @param key 键
     * @param value 值
     */
    set(key: string | number, value: any): void

    /**
     * 获取键值对
     * @param key 键
     */
    get(key: string | number): any;

    /**
     * 删除键值对
     * @param key 键
     */
    delete(key: string | number): void;

    /**
     * 获取某一类服务器
     * @param serverType 服务器类型
     */
    getServersByType(serverType: string): ServerInfo[];

    /**
     * 获取某一个服务器
     * @param serverId 服务器id
     */
    getServerById(serverId: string): ServerInfo;

    /**
     * 路由配置   《前端专用》
     * @param serverType 服务器类型
     * @param routeFunc 路由函数
     */
    route(serverType: string, routeFunc: (app: Application, session: Session, serverType: string, cb: (serverId: string) => void) => void): void;

    /**
     * rpc路由配置
     * @param serverType 服务器类型
     * @param rpcRouteFunc 路由函数
     */
    rpcRoute(serverType: string, rpcRouteFunc: (app: Application, routeParam: any, cb: (serverId: string) => void) => void): void;

    /**
     * 是否有该客户端   《前端专用》
     * @param uid 标识uid
     */
    hasClient(uid: number): boolean;

    /**
     * 关闭绑定的客户端     《前端专用》
     * @param uid 标识uid
     */
    closeClient(uid: number): void;

    /**
     * 配置部分session   《前端专用》
     * @param uid 标识uid
     * @param settings session里的部分配置
     */
    applySession(uid: number, settings: { [key: string]: any }): void;

    /**
     * 向客户端发送消息  《前端专用》
     * @param cmd 路由
     * @param msg 消息
     * @param uids uid数组
     */
    sendMsgByUid(cmd: string, msg: any, uids: number[]): void;

    /**
     * 向所有的客户端发送消息  《前端专用》
     * @param cmd 路由
     * @param msg 消息
     */
    sendAll(cmd: string, msg: any): void;

    /**
     * 向客户端发送消息  《后端专用》
     * @param cmd 路由
     * @param msg 消息
     * @param uids uid数组
     * @param sids sid数组
     */
    sendMsgByUidSid(cmd: string, msg: any, uids: number[], sids: string[]): void;

    /**
     * 配置服务器执行函数
     * @param type 服务器类型   "all" 或者 "gate|connector"形式
     * @param cb 
     */
    configure(type: string, cb: () => void): void;

    /**
     * 内部日志输出
     * @param cb 回调函数
     */
    onLog(cb: (level: string, filename: string, info: string) => void): void;

    /**
     * 加载模块
     * @param dir 相对根目录的路径
     */
    loadFile(dir: string): any;

    /**
     * 获取bind的socket连接数
     */
    getBindClientNum(): number;
}

/**
 * Session 类
 */
export interface Session {
    /**
     * 绑定的uid
     */
    readonly uid: number;

    /**
     * 前端服务器id
     */
    readonly sid: string;

    /**
     * 绑定uid   《前端专用》
     * @param uid 标识uid
     */
    bind(uid: number): boolean;

    /**
     * 设置键值对
     * @param key 键
     * @param value 值
     */
    set(key: number | string, value: any): void;

    /**
     * 获取键值对
     * @param key 键
     */
    get(key: number | string): any;

    /**
     * 删除键值对
     * @param key 键
     */
    delete(key: number | string): void;

    /**
     * 将后端session同步到前端  《后端专用》
     */
    apply(): void;

    /**
     * 客户端断开连接的回调   《前端专用》
     * @param cb 回调
     */
    setCloseCb(cb: (app: Application, session: Session) => void): void;

    /**
     * 关闭连接   《前端专用》
     */
    close(): void;
}

/**
 * 服务器信息
 */
export interface ServerInfo {
    /**
     * 服务器id
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
     * 是否是前端服务器
     */
    readonly frontend?: boolean;
    /**
     * 是否是独立的
     */
    readonly alone?: boolean;

    [key: string]: any;
}

declare global {
    interface Rpc {
    }
}

/**
 * rpc 构造器
 */
export type RpcClass<T> = {
    [K in keyof T]: T[K]
}
