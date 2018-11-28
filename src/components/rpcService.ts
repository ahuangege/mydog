/**
 * rpc连接的管理，发送rpc消息
 */


import Application from "../application";
import { rpcRouteFunc, ServerInfo, rpcTimeout, SocketProxy, loggerType, componentName } from "../util/interfaceDefine";
import * as path from "path";
import * as fs from "fs";
import define from "../util/define";
import { TcpClient } from "./tcpClient";

let app: Application;
let rpcRouter: { [serverType: string]: rpcRouteFunc };
let servers: { [serverType: string]: ServerInfo[] };
let serversIdMap: { [id: string]: ServerInfo };
let connectingClients: { [id: string]: rpc_client_proxy } = {};
let client_index = 1;
let clients: rpc_client_proxy[] = [];
let msgHandler: { [filename: string]: any } = {};
let rpcId = 1;
let rpcRequest: { [id: number]: rpcTimeout } = {};
const rpcTimeMax: number = 10 * 1000;

/**
 * 初始化
 * @param _app 
 */
export function init(_app: Application) {
    app = _app;
    rpcRouter = app.rpcRouter;
    servers = app.servers;
    serversIdMap = app.serversIdMap;
    new rpc_create();
    clearRpcTimeOut();
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
        let dirName = path.join(app.base, define.File_Dir.Servers);
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
                cb && cb({ "code": 1, "info": "no such end server " });
                return;
            }
            let rpcInvoke = {} as any;
            rpcInvoke["from"] = app.serverId;
            rpcInvoke["to"] = sid;
            rpcInvoke["route"] = file_method;

            if (cb) {
                rpcInvoke["id"] = getRpcId();
                rpcRequest[rpcInvoke.id as number] = {
                    "cb": cb,
                    "time": Date.now() + rpcTimeMax
                };
            }

            let client = getRpcSocket();
            if (client) {
                sendRpcMsg(client, rpcInvoke, args);
            } else {
                cb && cb({ "code": 2, "info": "has no rpc server" });
            }
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
            cb && cb({ "code": 1, "info": app.serverId + " has no rpc server named " + toServerId });
            return;
        }

        let rpcInvoke = {} as any;
        rpcInvoke["from"] = app.serverId;
        if (cb) {
            rpcInvoke["id"] = getRpcId();
            rpcRequest[rpcInvoke.id] = {
                "cb": cb,
                "time": Date.now() + rpcTimeMax
            };
        }
        rpcInvoke['route'] = file_method;
        rpcInvoke["to"] = toServerId;
        let client = getRpcSocket();
        if (client) {
            sendRpcMsg(client, rpcInvoke, args);
        } else {
            cb && cb({ "code": 2, "info": "has no rpc server" });
        }
    }

    proxyCbSendToServerType(serverType: string, file_method: string, args: any[]) {
        let cb: Function = null as any;
        if (typeof args[args.length - 1] === "function") {
            cb = args.pop();
        }

        let endTo: string[] = [];
        for (let i = 0; i < servers[serverType].length; i++) {
            endTo.push(servers[serverType][i].id);
        }
        if (endTo.length === 0) {
            cb && cb(undefined, {});
        }

        let nums: number = endTo.length;
        let endCb: Function = null as any;
        let bindCb: Function = null as any;
        let called = false;
        let msgObj = {} as any;
        let timeout: NodeJS.Timer = null as any;
        if (cb) {
            endCb = function (id: string, err: any, msg: any) {
                if (called) {
                    return;
                }
                nums--;
                if (err) {
                    clearTimeout(timeout);
                    called = true;
                    cb(err);
                    return;
                }
                msgObj[id] = msg;
                if (nums === 0) {
                    clearTimeout(timeout);
                    called = true;
                    cb(undefined, msgObj);
                }
            };

            timeout = setTimeout(function () {
                called = true;
                cb({ "code": 4, "info": "rpc time out" });
            }, 10000);

            bindCb = function (id: string) {
                return function (err: any, msg: any) {
                    endCb(id, err, msg)
                };
            };

        }


        let tmpCb: Function = null as any;
        for (let i = 0; i < endTo.length; i++) {
            if (cb) {
                tmpCb = bindCb(endTo[i]);
            }
            send(endTo[i], tmpCb)
        }

        function send(toId: string, callback: Function) {
            let rpcInvoke = {} as any;
            rpcInvoke["from"] = app.serverId;
            if (callback) {
                rpcInvoke["id"] = getRpcId();
                rpcRequest[rpcInvoke.id] = {
                    "cb": callback,
                    "time": Date.now() + rpcTimeMax
                };
            }
            rpcInvoke['route'] = file_method;
            rpcInvoke["to"] = toId;
            let client = getRpcSocket();
            if (client) {
                sendRpcMsg(client, rpcInvoke, args);
            } else {
                callback && callback({ "code": 2, "info": "has no rpc server" });
            }
        }
    }
}


function getRpcId() {
    let id = rpcId++;
    if (rpcId > 999999) {
        rpcId = 1;
    }
    return id;
}

function getRpcSocket() {
    let socket = null;
    if (clients.length) {
        socket = clients[client_index % clients.length];
        client_index = (client_index + 1) % clients.length;
    }
    return socket;
}

function sendRpcMsg(client: rpc_client_proxy, iMsg: any, msg: any) {
    let iMsgBuf = Buffer.from(JSON.stringify(iMsg));
    let msgBuf = Buffer.from(JSON.stringify(msg));
    let buf = Buffer.allocUnsafe(6 + iMsgBuf.length + msgBuf.length);
    buf.writeUInt32BE(2 + iMsgBuf.length + msgBuf.length, 0);
    buf.writeUInt8(define.Rpc_Msg.msg, 4);
    buf.writeUInt8(iMsgBuf.length, 5);
    iMsgBuf.copy(buf, 6);
    msgBuf.copy(buf, 6 + iMsgBuf.length);
    client.send(buf);
}

/**
 * 删除rpc计时
 */
function delRequest(id: number) {
    delete rpcRequest[id];
}

/**
 * rpc 超时判断
 */
function clearRpcTimeOut() {
    setTimeout(function () {
        let nowTime = Date.now();
        let tmp: rpcTimeout;
        for (let id in rpcRequest) {
            tmp = rpcRequest[id];
            if (nowTime > tmp.time) {
                delRequest(id as any);
                try {
                    tmp.cb({ "code": 4, "info": "rpc time out" });
                } catch (err) {
                }
            }
        }
        clearRpcTimeOut();
    }, 3000);
}

/**
 * rpc回调
 */
function getCallBackFunc(to: string, id: number) {
    return function (data: any) {
        if (data === undefined) {
            data = null;
        }
        let rpcInvoke = { "to": to, "id": id };
        let client = getRpcSocket();
        if (client) {
            sendRpcMsg(client, rpcInvoke, data);
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
        this.doConnect(define.Time.Rpc_Reconnect_Time * 1000);
    }

    private heartbeat() {
        let self = this;
        this.heartbeat_timer = setTimeout(function () {
            let buf = Buffer.allocUnsafe(5);
            buf.writeUInt32BE(1, 0);
            buf.writeUInt8(define.Rpc_Msg.heartbeat, 4);
            self.send(buf);
            self.heartbeat();
        }, define.Time.Rpc_Heart_Beat_Time * 1000)
    }

    send(buf: Buffer) {
        this.socket.send(buf);
    }

    private dealMsg(data: Buffer) {
        let iMsgLen = data.readUInt8(0);
        let iMsg = JSON.parse(data.slice(1, 1 + iMsgLen).toString());
        let msg = JSON.parse(data.slice(1 + iMsgLen).toString());
        if (!iMsg.from) {
            if (rpcRequest[iMsg.id as number]) {
                rpcRequest[iMsg.id as number].cb(iMsg.err, msg);
                delRequest(iMsg.id as number);
            }
        } else {
            let cmd = iMsg.route.split('.');
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

