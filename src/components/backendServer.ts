/**
 * 后端服务器启动监听端口，并接受前端服务器的连接
 */


import Application from "../application";
import { setEncode, encodeRemoteData_1, encodeRemoteData_2, encodeInnerData } from "./msgCoder";
import * as path from "path";
import * as fs from "fs";
import define = require("../util/define");
import tcpServer from "./tcpServer";
import { SocketProxy, loggerType, componentName, decode_func } from "../util/interfaceDefine";
import { Session, initSessionApp } from "./session";
import * as remoteBackend from "./remoteBackend";

let app: Application;
let routeConfig: string[];
let msgHandler: { [filename: string]: any } = {};
let decode: decode_func | null = null;

export function start(_app: Application, cb: Function) {
    app = _app;
    routeConfig = app.routeConfig;
    let encodeDecodeConfig = app.encodeDecodeConfig;
    if (encodeDecodeConfig) {
        decode = encodeDecodeConfig.decode || null;
        setEncode(encodeDecodeConfig.encode);
    }

    initSessionApp(app);
    loadHandler();
    startServer(cb);
}

/**
 * 后端服务器加载路由处理
 */
function loadHandler() {
    let dirName = path.join(app.base, define.some_config.File_Dir.Servers, app.serverType, "handler");
    let exists = fs.existsSync(dirName);
    if (exists) {
        fs.readdirSync(dirName).forEach(function (filename) {
            if (!/\.js$/.test(filename)) {
                return;
            }
            let name = path.basename(filename, '.js');
            let handler = require(path.join(dirName, filename));
            if (handler.default && typeof handler.default === "function") {
                msgHandler[name] = new handler.default(app);
            } else if (typeof handler === "function") {
                msgHandler[name] = new handler(app);
            }
        });
    }
}

/**
 * 服务器启动
 */
function startServer(cb: Function) {
    let startCb = function () {
        let str = "server start: " + app.host + ":" + app.port + " / " + app.serverId;
        console.log(str);
        app.logger(loggerType.info, componentName.master, str);
        cb && cb();
    };
    let newClientCb = function (socket: SocketProxy) {
        new backend_socket(socket);
    };
    tcpServer(app.port, startCb, newClientCb);
}


class backend_socket {
    private socket: SocketProxy;
    private heartBeatTimer: NodeJS.Timeout = null as any;
    private registerTimer: NodeJS.Timeout = null as any;
    private registered: boolean = false;
    private sid: string = "";
    constructor(socket: SocketProxy) {
        this.socket = socket;
        socket.on('data', this.onData.bind(this));
        socket.on('close', this.onClose.bind(this));
        this.registerTimer = setTimeout(function () {
            app.logger(loggerType.warn, componentName.backendServer, "register time out, close the socket: " + socket.socket.remoteAddress);
            socket.close();
        }, 10000);

        this.heartBeat_handle();
    }

    /**
     * socket收到数据了
     * @param data
     */
    private onData(data: Buffer) {
        let type = data.readUInt8(0);

        try {
            if (type === define.Front_To_Back.msg) {
                this.msg_handle(data);
            } else if (type === define.Front_To_Back.register) {
                this.register_handle(data);
            } else if (type === define.Front_To_Back.heartbeat) {
                this.heartBeat_handle();
                this.heartbeat_response();
            } else {
                app.logger(loggerType.warn, componentName.backendServer, "illegal data, close the socket" + this.socket.socket.remoteAddress + " " + this.sid);
                this.socket.close();
            }
        } catch (e) {
            app.logger(loggerType.error, componentName.backendServer, e);
        }
    }

    /**
     * socket连接关闭了
     */
    private onClose() {
        clearTimeout(this.registerTimer);
        clearTimeout(this.heartBeatTimer);
        if (this.registered) {
            remoteBackend.removeClient(this.sid);
        }
    }

    /**
     * 前端服务器注册
     */
    private register_handle(_data: Buffer) {
        let data: any;
        try {
            data = JSON.parse(_data.slice(1).toString());
        } catch (err) {
            app.logger(loggerType.warn, componentName.backendServer, "register JSON parse err , close the socket: " + this.socket.socket.remoteAddress);
            this.socket.close();
            return;
        }
        if (data.serverToken !== app.serverToken) {
            app.logger(loggerType.warn, componentName.backendServer, "illegal register token, close the socket: " + this.socket.socket.remoteAddress);
            this.socket.close();
            return;
        }
        this.registered = true;
        this.sid = data.sid;
        clearTimeout(this.registerTimer);
        remoteBackend.addClient(this.sid, this.socket);
        app.logger(loggerType.info, componentName.backendServer, "get a new frontend server named " + this.sid);
    }

    /**
     * 心跳
     */
    private heartBeat_handle() {
        let self = this;
        clearTimeout(this.heartBeatTimer);
        this.heartBeatTimer = setTimeout(function () {
            app.logger(loggerType.warn, componentName.backendServer, "heartbeat timeout, close the frontend server named " + self.sid);
            self.socket.close();
        }, define.some_config.Time.Remote_Heart_Beat_Time * 1000 * 2);
    }

    /**
     * 心跳回应
     */
    private heartbeat_response() {
        let buf = Buffer.allocUnsafe(5);
        buf.writeUInt32BE(1, 0);
        buf.writeUInt8(define.Back_To_Front.heartbeatResponse, 4);
        this.socket.send(buf);
    }

    /**
     * 收到前端服务器消息
     * @param msgBuf
     */
    private msg_handle(msgBuf: Buffer) {
        if (!this.registered) {
            app.logger(loggerType.warn, componentName.backendServer, "get data before registerd, close the socket" + this.socket.socket.remoteAddress);
            this.socket.close();
            return;
        }
        let sessionLen = msgBuf.readUInt16BE(1);
        let sessionBuf = msgBuf.slice(3, 3 + sessionLen);
        let session = new Session();
        session.setAll(JSON.parse(sessionBuf.toString()));

        let cmdId = msgBuf.readUInt8(3 + sessionLen);
        let cmd = routeConfig[cmdId];
        let cmdArr = cmd.split('.');
        let msg: any;
        if (decode) {
            msg = decode(cmdId, msgBuf.slice(4 + sessionLen), session);
        } else {
            msg = JSON.parse(msgBuf.slice(4 + sessionLen).toString());
        }
        msgHandler[cmdArr[1]][cmdArr[2]](msg, session, this.callback(cmdId, session.uid));
    }

    /**
     * 回调
     * @param cmdId 
     * @param uid 
     */
    private callback(cmdId: number, uid: number) {
        let self = this;
        return function (msg: any) {
            if (msg === undefined) {
                msg = null;
            }
            let msgBuf = encodeRemoteData_1(cmdId, msg);
            let buf = encodeRemoteData_2([uid], cmdId, msgBuf);
            self.socket.send(buf);
        };
    }
}

