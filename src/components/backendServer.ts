/**
 * 后端服务器启动监听端口，并接受前端服务器的连接
 */


import Application from "../application";
import { setEncode, encodeRemoteData, encodeData } from "./msgCoder";
import * as path from "path";
import * as fs from "fs";
import define from "../util/define";
import tcpServer from "./tcpServer";
import { SocketProxy, loggerType, componentName } from "../util/interfaceDefine";
import { Session, initSessionApp } from "./session";

let app: Application;
let routeConfig: string[];
let msgHandler: { [filename: string]: any } = {};
let decode: Function;

export function start(_app: Application, cb: Function) {
    app = _app;
    routeConfig = app.routeConfig;
    let encodeDecodeConfig = app.get("encodeDecodeConfig");
    if (encodeDecodeConfig) {
        decode = encodeDecodeConfig["decode"] || null;
        setEncode(encodeDecodeConfig["encode"]);
    }

    initSessionApp(app);
    loadHandler();
    startServer(cb);
}

/**
 * 后端服务器加载路由处理
 */
function loadHandler() {
    let dirName = path.join(app.base, define.File_Dir.Servers, app.serverType, "handler");
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
        console.log("server start: " + app.host + ":" + app.port + " / " + app.serverId);
        cb && cb();
    };
    let newClientCb = function (socket: SocketProxy) {
        new backend_socket(socket);
    };
    tcpServer(app.port, startCb, newClientCb);
}


class backend_socket {
    private socket: SocketProxy;
    private heartBeatTimer: NodeJS.Timer | null = null;
    private registerTimer: NodeJS.Timer | null = null;
    private registered: boolean = false;
    private sid: string = "";
    constructor(socket: SocketProxy) {
        this.socket = socket;
        socket.on('data', this.onData.bind(this));
        socket.on('close', this.onClose.bind(this));
        this.registerTimer = setTimeout(function () {
            app.logger(loggerType.warn, componentName.backendServer, "register time out");
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
        if (type === define.Front_To_Back.msg) {
            this.msg_handle(data);
        } else if (type === define.Front_To_Back.register) {
            this.register_handle(data);
        } else if (type === define.Front_To_Back.heartbeat) {
            this.heartBeat_handle();
        } else {
            app.logger(loggerType.debug, componentName.backendServer, "illegal data : " + this.sid);
            this.socket.close();
        }
    }

    /**
     * socket连接关闭了
     */
    private onClose() {
        clearTimeout(this.registerTimer as NodeJS.Timer);
        clearTimeout(this.heartBeatTimer as NodeJS.Timer);
        if (this.registered) {
            app.remoteBackend.removeClient(this.sid);
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
            this.socket.close();
            return;
        }
        if (data.serverToken !== app.serverToken) {
            app.logger(loggerType.debug, componentName.backendServer, "illegal register token");
            this.socket.close();
            return;
        }
        this.registered = true;
        this.sid = data.sid;
        clearTimeout(this.registerTimer as NodeJS.Timer);
        app.remoteBackend.addClient(this.sid, this.socket);
    }

    /**
     * 心跳
     */
    private heartBeat_handle() {
        let self = this;
        clearTimeout(this.heartBeatTimer as NodeJS.Timer);
        this.heartBeatTimer = setTimeout(function () {
            app.logger(loggerType.warn, componentName.backendServer, "heartbeat time out : " + self.sid);
            self.socket.close();
        }, define.Time.Remote_Heart_Beat_Time * 1000 * 2);
    }

    /**
     * 收到前端服务器消息
     * @param msgBuf
     */
    private msg_handle(msgBuf: Buffer) {
        let sessionLen = msgBuf.readUInt16BE(1);
        let sessionBuf = msgBuf.slice(3, 3 + sessionLen);
        let session = new Session();
        session.setAll(JSON.parse(sessionBuf.toString()));

        let cmdId = msgBuf.readUInt8(3 + sessionLen);
        let cmd = routeConfig[cmdId];
        let cmdArr = cmd.split('.');
        let msg: any;
        if (decode) {
            msg = decode(cmdId, msgBuf.slice(4 + sessionLen));
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
            let msgBuf = encodeData(cmdId, msg);
            let buf = encodeRemoteData([uid], cmdId, msgBuf);
            self.socket.send(buf);
        };
    }
}

