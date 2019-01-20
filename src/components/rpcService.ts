/**
 * rpc连接的管理，发送rpc消息
 */


import Application from "../application";
import { rpcRouteFunc, ServerInfo, rpcTimeout, SocketProxy, loggerType, componentName, rpcErr, rpcMsg } from "../util/interfaceDefine";
import * as path from "path";
import * as fs from "fs";
import define = require("../util/define");
import { TcpClient } from "./tcpClient";

let app: Application;
let rpcRouter: { [serverType: string]: rpcRouteFunc };
let servers: { [serverType: string]: ServerInfo[] };
let serversIdMap: { [id: string]: ServerInfo };
let connectingClients: { [id: string]: rpc_client_proxy } = {};
let client_index = 1;
let clients: rpc_client_proxy[] = [];
let msgHandler: { [filename: string]: any } = {};
let rpcId = 1;  // 必须从1开始，不可为0
let rpcRequest: { [id: number]: rpcTimeout } = {};
let rpcTimeMax: number = 10 * 1000;

/**
 * 初始化
 * @param _app 
 */
export function init(_app: Application) {
    app = _app;
    rpcRouter = app.rpcRouter;
    servers = app.servers;
    serversIdMap = app.serversIdMap;
    let rpcConfig = app.rpcConfig;
    if (rpcConfig) {
        if (rpcConfig.hasOwnProperty("timeOut") && Number(rpcConfig["timeOut"]) > 5) {
            rpcTimeMax = Number(rpcConfig["timeOut"]) * 1000;
        }
    }
    new rpc_create();
}

/**
 * 新增rpc server
 * @param server 
 */
export function addRpcServer(server: ServerInfo) {
    if (connectingClients[server.id]) {
        connectingClients[server.id].close();
    } else {
        for (let i = 0; i < clients.length; i++) {
            if (clients[i].id === server.id) {
                clients[i].close();
                break;
            }
        }
    }

    new rpc_client_proxy(server);
}

/**
 * 移除rpc server
 * @param id 
 */
export function removeRpcServer(id: string) {
    for (let i = 0; i < clients.length; i++) {
        if (clients[i].id === id) {
            clients[i].close();
            return;
        }
    }
    if (connectingClients[id]) {
        connectingClients[id].close();
    }
};

const enum rpc_type {
    route,
    toServer,
}

/**
 * rpc构造
 */
class rpc_create {

    rpcType: rpc_type = rpc_type.route;
    rpcParam: any = null;
    rpcObj: Rpc = {};

    constructor() {
        this.loadRemoteMethod();
    }

    loadRemoteMethod() {
        let self = this;
        app.rpc = { "route": this.route.bind(this), "toServer": this.toServer.bind(this) };
        let tmp_rpc_obj = this.rpcObj as any;
        let dirName = path.join(app.base, define.some_config.File_Dir.Servers);
        let exists = fs.existsSync(dirName);
        if (!exists) {
            return;
        }
        fs.readdirSync(dirName).forEach(function (serverName) {
            let server: { [filename: string]: any } = {};
            let remoteDirName = path.join(dirName, serverName, '/remote');
            let exists = fs.existsSync(remoteDirName);
            if (exists) {
                fs.readdirSync(remoteDirName).forEach(function (fileName) {
                    if (!/\.js$/.test(fileName)) {
                        return;
                    }
                    let name = path.basename(fileName, '.js');
                    let remote = require(path.join(remoteDirName, fileName));
                    if (remote.default && typeof remote.default === "function") {
                        server[name] = new remote.default(app);
                    } else if (typeof remote === "function") {
                        server[name] = new remote(app);
                    }
                });
            }
            tmp_rpc_obj[serverName] = {};
            for (let name in server) {
                tmp_rpc_obj[serverName][name] = self.initFunc(serverName, name, server[name]);
            }
            if (serverName === app.serverType) {
                msgHandler = server;
            }
        });
    }

    route(routeParam: any) {
        this.rpcType = rpc_type.route;
        this.rpcParam = routeParam;
        return this.rpcObj;
    }

    toServer(serverId: string) {
        this.rpcType = rpc_type.toServer;
        this.rpcParam = serverId;
        return this.rpcObj;
    }


    initFunc(serverName: string, fileName: string, obj: any) {
        let res: { [method: string]: Function } = {};
        for (let field in obj) {
            if (typeof obj[field] === "function") {
                res[field] = this.proxyCb(serverName, fileName + "." + field);
            }
        }
        return res;
    }

    proxyCb(serverName: string, file_method: string) {
        let self = this;
        let func = function (...args: any[]) {
            if (self.rpcType === rpc_type.route) {
                self.proxyCbSendByRoute(self.rpcParam, serverName, file_method, args);
            } else {
                self.proxyCbSendToServer(self.rpcParam, serverName, file_method, args);
            }
            self.rpcParam = null;
        }
        return func;
    }

    proxyCbSendByRoute(routeParam: any, serverType: string, file_method: string, args: any[]) {
        let cb: Function | null = null;
        if (typeof args[args.length - 1] === "function") {
            cb = args.pop();
        }

        let cbFunc = function (sid: string) {
            if (!serversIdMap[sid]) {
                cb && cb(rpcErr.src_has_no_end);
                return;
            }

            if (sid === app.serverId) {
                if (cb) {
                    let timeout = {
                        "id": getRpcId(),
                        "cb": cb,
                        "timer": null as any
                    }
                    createRpcTimeout(timeout);
                    args.push(getCallBackFuncSelf(timeout.id));
                }
                sendRpcMsgToSelf(file_method, args);
                return;
            }

            let client = getRpcSocket();
            if (!client) {
                cb && cb(rpcErr.src_has_no_rpc);
                return;
            }

            let rpcInvoke: rpcMsg = {
                "from": app.serverId,
                "to": sid,
                "route": file_method
            };
            if (cb) {
                let timeout = {
                    "id": getRpcId(),
                    "cb": cb,
                    "timer": null as any
                }
                createRpcTimeout(timeout);
                rpcInvoke["id"] = timeout.id;
            }
            sendRpcMsg(client, rpcInvoke, args);
        };

        let tmpRouter = rpcRouter[serverType];
        if (tmpRouter) {
            tmpRouter(app, routeParam, cbFunc);
        } else {
            let list = servers[serverType];
            if (!list || !list.length) {
                cbFunc("");
            } else {
                let index = Math.floor(Math.random() * list.length);
                cbFunc(list[index].id);
            }
        }
    }

    proxyCbSendToServer(toServerId: string, serverType: string, file_method: string, args: any[]) {
        if (toServerId === "*") {
            this.proxyCbSendToServerType(serverType, file_method, args);
            return;
        }

        let cb: Function = null as any;
        if (typeof args[args.length - 1] === "function") {
            cb = args.pop();
        }

        if (!serversIdMap[toServerId]) {
            cb && cb(rpcErr.src_has_no_end);
            return;
        }

        if (toServerId === app.serverId) {
            if (cb) {
                let timeout = {
                    "id": getRpcId(),
                    "cb": cb,
                    "timer": null as any
                }
                createRpcTimeout(timeout);
                args.push(getCallBackFuncSelf(timeout.id));
            }
            sendRpcMsgToSelf(file_method, args);
            return;
        }

        let client = getRpcSocket();
        if (!client) {
            cb && cb(rpcErr.src_has_no_rpc);
            return;
        }

        let rpcInvoke: rpcMsg = {
            "from": app.serverId,
            "to": toServerId,
            "route": file_method
        };
        if (cb) {
            let timeout = {
                "id": getRpcId(),
                "cb": cb,
                "timer": null as any
            }
            createRpcTimeout(timeout);
            rpcInvoke.id = timeout.id;
        }
        sendRpcMsg(client, rpcInvoke, args);
    }

    proxyCbSendToServerType(serverType: string, file_method: string, args: any[]) {
        let cb: Function = null as any;
        if (typeof args[args.length - 1] === "function") {
            cb = args.pop();
        }
        let endTo: string[] = [];
        if (servers[serverType]) {
            for (let i = 0; i < servers[serverType].length; i++) {
                endTo.push(servers[serverType][i].id);
            }
        }
        if (endTo.length === 0) {
            cb && cb({});
            return;
        }

        let nums: number = endTo.length;
        let bindCb: Function = null as any;
        let msgObj = {} as any;
        if (cb) {
            bindCb = function (id: string) {
                return function (...msg: any[]) {
                    nums--;
                    msgObj[id] = msg;
                    if (nums === 0) {
                        cb(msgObj);
                    }
                };
            };
        }

        let tmpCb: Function = null as any;
        for (let i = 0; i < endTo.length; i++) {
            if (cb) {
                tmpCb = bindCb(endTo[i]);
            }
            send(endTo[i], tmpCb);
        }

        function send(toId: string, callback: Function) {
            if (toId === app.serverId) {
                let tmp_args = [...args];
                if (callback) {
                    let timeout = {
                        "id": getRpcId(),
                        "cb": callback,
                        "timer": null as any
                    }
                    createRpcTimeout(timeout);
                    tmp_args.push(getCallBackFuncSelf(timeout.id));
                }
                sendRpcMsgToSelf(file_method, tmp_args);
                return;
            }

            let client = getRpcSocket();
            if (!client) {
                callback && callback(rpcErr.src_has_no_rpc);
                return;
            }
            let rpcInvoke: rpcMsg = {
                "from": app.serverId,
                "to": toId,
                "route": file_method
            };
            if (callback) {
                let timeout = {
                    "id": getRpcId(),
                    "cb": callback,
                    "timer": null as any
                }
                createRpcTimeout(timeout);
                rpcInvoke["id"] = timeout.id;
            }
            sendRpcMsg(client, rpcInvoke, args);
        }
    }
}


/**
 * rpc超时计时器
 * @param timeout 
 */
function createRpcTimeout(timeout: rpcTimeout) {
    rpcRequest[timeout.id] = timeout;
    timeout.timer = setTimeout(function () {
        delRequest(timeout.id);
        timeout.cb(rpcErr.rpc_time_out);
    }, rpcTimeMax);
}

/**
 * 获取rpcId
 */
function getRpcId() {
    let id = rpcId++;
    if (rpcId > 999999) {
        rpcId = 1;
    }
    return id;
}

/**
 * 获取一个rpc socket
 */
function getRpcSocket() {
    let socket = null;
    if (clients.length) {
        socket = clients[client_index % clients.length];
        client_index = (client_index + 1) % clients.length;
    }
    return socket;
}



/**
 * 发送给rpc服务器，进行中转
 * @param client 
 * @param iMsg 内部导向消息
 * @param msg 用户传输消息
 * 
 *  消息格式如下:
 * 
 *    [4]        [1]         [4]         [1]      [...]      [...]
 *  allMsgLen   msgType    rpcMsgLen   iMsgLen    iMsg        msg
 * 
 */
function sendRpcMsg(client: rpc_client_proxy, iMsg: rpcMsg, msg: any) {
    let iMsgBuf = Buffer.from(JSON.stringify(iMsg));
    let msgBuf = Buffer.from(JSON.stringify(msg));
    let buf = Buffer.allocUnsafe(10 + iMsgBuf.length + msgBuf.length);
    buf.writeUInt32BE(6 + iMsgBuf.length + msgBuf.length, 0);
    buf.writeUInt8(define.Rpc_Msg.msg, 4);
    buf.writeUInt32BE(1 + iMsgBuf.length + msgBuf.length, 5);
    buf.writeUInt8(iMsgBuf.length, 9);
    iMsgBuf.copy(buf, 10);
    msgBuf.copy(buf, 10 + iMsgBuf.length);
    client.send(buf);
}


function sendRpcMsgToSelf(route: string, msg: any[]) {
    let cmd = route.split('.');
    let file = msgHandler[cmd[0]];
    file[cmd[1]].apply(file, msg);
}


/**
 * 删除rpc计时
 */
function delRequest(id: number) {
    delete rpcRequest[id];
}



/**
 * rpc回调
 */
function getCallBackFunc(to: string, id: number) {
    return function (...args: any[]) {
        let rpcInvoke: rpcMsg = {
            "to": to,
            "id": id
        };
        let client = getRpcSocket();
        if (client) {
            sendRpcMsg(client, rpcInvoke, args);
        }
    }
}

/**
 * rpc本服务器回调
 */
function getCallBackFuncSelf(id: number) {
    return function (...args: any[]) {
        let timeout = rpcRequest[id];
        if (timeout) {
            delRequest(id);
            clearTimeout(timeout.timer);
            timeout.cb.apply(null, args);
        }
    }
}


/**
 * rpc socket
 */
class rpc_client_proxy {
    public id: string;
    private host: string;
    private port: number;
    private socket: SocketProxy = null as any;
    private connect_timer: NodeJS.Timer = null as any;
    private heartbeat_timer: NodeJS.Timer = null as any;
    private die: boolean = false;

    constructor(server: ServerInfo) {
        this.id = server.id;
        this.host = server.host;
        this.port = server.port;
        this.doConnect(0);
    }

    private doConnect(delay: number) {
        if (this.die) {
            return;
        }
        let self = this;
        connectingClients[self.id] = this;
        this.connect_timer = setTimeout(function () {
            let connectCb = function () {
                app.logger(loggerType.info, componentName.rpcService, " connect to rpc server " + self.id + " success");

                delete connectingClients[self.id];
                clients.push(self);

                // 注册
                let loginBuf = Buffer.from(JSON.stringify({
                    sid: app.serverId,
                    serverToken: app.serverToken
                }));
                let buf = Buffer.allocUnsafe(loginBuf.length + 5);
                buf.writeUInt32BE(loginBuf.length + 1, 0);
                buf.writeUInt8(define.Rpc_Msg.register, 4);
                loginBuf.copy(buf, 5);
                tmpClient.send(buf);

                // 心跳包
                self.heartbeat();
            };
            let tmpClient = new TcpClient(self.port, self.host, connectCb);
            self.socket = tmpClient;
            tmpClient.on("data", self.dealMsg.bind(self));
            tmpClient.on("close", self.onClose.bind(self));

        }, delay);
    }



    private removeFromClients() {
        let index = clients.indexOf(this);
        if (index !== -1) {
            clients.splice(index, 1);
        }
    }

    private onClose() {
        clearTimeout(this.heartbeat_timer);
        this.removeFromClients();
        this.socket = null as any;
        app.logger(loggerType.warn, componentName.rpcService, "rpc connect " + this.id + " fail, reconnect later");
        this.doConnect(define.some_config.Time.Rpc_Reconnect_Time * 1000);
    }

    private heartbeat() {
        let self = this;
        this.heartbeat_timer = setTimeout(function () {
            let buf = Buffer.allocUnsafe(5);
            buf.writeUInt32BE(1, 0);
            buf.writeUInt8(define.Rpc_Msg.heartbeat, 4);
            self.send(buf);
            self.heartbeat();
        }, define.some_config.Time.Rpc_Heart_Beat_Time * 1000)
    }

    send(buf: Buffer) {
        this.socket.send(buf);
    }

    private dealMsg(data: Buffer) {
        let iMsgLen = data.readUInt8(0);
        let iMsg: rpcMsg = JSON.parse(data.slice(1, 1 + iMsgLen).toString());
        let msg = JSON.parse(data.slice(1 + iMsgLen).toString());
        if (!iMsg.from) {
            let timeout = rpcRequest[iMsg.id as number];
            if (timeout) {
                delRequest(iMsg.id as number);
                clearTimeout(timeout.timer);
                timeout.cb.apply(null, msg);
            }
        } else {
            let cmd = (iMsg.route as string).split('.');
            if (iMsg.id) {
                msg.push(getCallBackFunc(iMsg.from, iMsg.id));
            }
            let file = msgHandler[cmd[0]];
            file[cmd[1]].apply(file, msg);
        }
    }

    close() {
        this.die = true;
        if (this.socket) {
            this.socket.close();
        }
        if (connectingClients[this.id] = this) {
            delete connectingClients[this.id];
        }
        clearTimeout(this.connect_timer);
    }
}

