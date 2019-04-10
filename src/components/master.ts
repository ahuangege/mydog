/**
 * master中心服务器，接受monitor连接，负责各服务器之间的互相认识，并接受cli命令
 */


import Application from "../application";
import { MasterCli } from "./cliUtil";
import { SocketProxy, monitor_get_new_server, monitor_remove_server, loggerType, componentName, monitor_reg_master } from "../util/interfaceDefine";
import tcpServer from "./tcpServer";
import { runServers } from "../util/starter";
import define = require("../util/define");
import * as msgCoder from "./msgCoder";

let servers: { [id: string]: Master_ServerProxy } = {};
let serversDataTmp: monitor_get_new_server = { "T": define.Master_To_Monitor.addServer, "serverInfoIdMap": {} };
let masterCli: MasterCli;
let app: Application;

export function start(_app: Application, cb?: Function) {
    app = _app;
    masterCli = new MasterCli(_app, servers);
    startServer(cb);
}

function startServer(cb?: Function) {

    tcpServer(app.port, startCb, newClientCb);

    function startCb() {
        let str = "server start: " + app.host + ":" + app.port + " / " + app.serverId;
        console.log(str);
        app.logger(loggerType.info, componentName.master, str);
        cb && cb();
        if (app.startMode === "all") {
            runServers(app);
        }
    }

    function newClientCb(socket: SocketProxy) {
        new UnregSocket_proxy(socket);
    }
}

/**
 * 尚未注册的socket代理
 */
class UnregSocket_proxy {
    private socket: SocketProxy;
    private registerTimer: NodeJS.Timeout = null as any;
    private onDataFunc: (data: Buffer) => void;
    private onCloseFunc: () => void;
    constructor(socket: SocketProxy) {
        this.socket = socket;

        this.onDataFunc = this.onData.bind(this);
        this.onCloseFunc = this.onClose.bind(this);
        socket.on("data", this.onDataFunc);
        socket.on("close", this.onCloseFunc);
        this.registerTimeout();
    }

    private registerTimeout() {
        let self = this;
        this.registerTimer = setTimeout(function () {
            app.logger(loggerType.warn, componentName.master, "the socket connected to master register time out, close the socket: " + self.socket.socket.remoteAddress);
            self.socket.close();
        }, 10000);

    }

    private onData(_data: Buffer) {
        let socket = this.socket;
        let data: any;
        try {
            data = JSON.parse(_data.toString());
        } catch (err) {
            app.logger(loggerType.warn, componentName.master, "unregistered socket, JSON parse error, close it: " + socket.socket.remoteAddress);
            socket.close();
            return;
        }

        // 第一个数据包必须是注册
        if (!data || data.T !== define.Monitor_To_Master.register) {
            app.logger(loggerType.warn, componentName.master, "unregistered socket, illegal data, close it: " + socket.socket.remoteAddress);
            socket.close();
            return;
        }

        // 是服务器？
        if (data.hasOwnProperty("serverToken")) {
            if (data.serverToken !== app.serverToken) {
                app.logger(loggerType.warn, componentName.master, "a monitor, illegal serverToken, close it: " + socket.socket.remoteAddress);
                socket.close();
                return;
            }
            if (!data.serverType || !data.serverInfo || !data.serverInfo.id || !data.serverInfo.host || !data.serverInfo.port) {
                app.logger(loggerType.warn, componentName.master, "a monitor, illegal serverInfo, close it: " + socket.socket.remoteAddress);
                socket.close();
                return;
            }
            this.registerOk();
            new Master_ServerProxy(data, socket);
            return;
        }

        // 是cli？
        if (data.hasOwnProperty("clientToken")) {
            if (data.clientToken !== app.clientToken) {
                app.logger(loggerType.warn, componentName.master, "a cli, illegal clientToken, close it: " + socket.socket.remoteAddress);
                socket.close();
                return;
            }
            this.registerOk();
            new Master_ClientProxy(socket);
            return;
        }

        app.logger(loggerType.warn, componentName.master, "master get a illegal socket, close it");
        socket.close();
    }

    private onClose() {
        clearTimeout(this.registerTimer);
        app.logger(loggerType.warn, componentName.master, "unregistered socket closed: " + this.socket.socket.remoteAddress);
    }

    private registerOk() {
        clearTimeout(this.registerTimer);
        this.socket.removeListener("data", this.onDataFunc);
        this.socket.removeListener("close", this.onCloseFunc);
        this.socket = null as any;
    }

}




/**
 * master处理服务器代理
 */
export class Master_ServerProxy {
    private socket: SocketProxy;
    private sid: string = "";
    private serverType: string = "";
    private heartbeatTimeoutTimer: NodeJS.Timeout = null as any;
    constructor(data: monitor_reg_master, socket: SocketProxy) {
        this.socket = socket;
        this.init(data);
    }

    private init(data: monitor_reg_master) {
        let socket = this.socket;

        if (!!servers[data.serverInfo.id]) {
            app.logger(loggerType.warn, componentName.master, "master already has a monitor named " + data.serverInfo.id + ", close the socket: " + socket.socket.remoteAddress);
            socket.close();
            return;
        }

        this.heartbeatTimeout();
        socket.on('data', this.onData.bind(this));
        socket.on('close', this.onClose.bind(this));


        this.sid = data.serverInfo.id;
        this.serverType = data.serverType;

        // 构造新增服务器的消息
        let socketInfo: monitor_get_new_server = {
            "T": define.Master_To_Monitor.addServer,
            "serverInfoIdMap": {}
        };
        socketInfo.serverInfoIdMap[this.sid] = {
            "serverType": data.serverType,
            "serverInfo": data.serverInfo
        };
        let socketInfoBuf: Buffer = msgCoder.encodeInnerData(socketInfo);

        // 向其他服务器通知,有新的服务器
        for (let sid in servers) {
            if (servers[sid].serverType !== "rpc") {
                servers[sid].socket.send(socketInfoBuf);
            }
        }

        // 通知新加入的服务器，当前已经有哪些服务器了
        if (this.serverType !== "rpc") {
            let result = msgCoder.encodeInnerData(serversDataTmp);
            socket.send(result);
        }

        servers[this.sid] = this;
        serversDataTmp.serverInfoIdMap[this.sid] = {
            "serverType": data.serverType,
            "serverInfo": data.serverInfo
        };

        app.logger(loggerType.info, componentName.master, "master gets a new monitor named " + this.sid);
    }

    private heartbeatTimeout() {
        let self = this;
        clearTimeout(this.heartbeatTimeoutTimer);
        this.heartbeatTimeoutTimer = setTimeout(function () {
            app.logger(loggerType.warn, componentName.master, "heartbeat time out, close the monitor named " + self.sid);
            self.socket.close();
        }, define.some_config.Time.Monitor_Heart_Beat_Time * 1000 * 2);
    }


    send(msg: any) {
        this.socket.send(msgCoder.encodeInnerData(msg));
    }

    private heartbeatResponse() {
        let msg = { T: define.Master_To_Monitor.heartbeatResponse };
        let buf = msgCoder.encodeInnerData(msg);
        this.socket.send(buf);
    }

    private onData(_data: Buffer) {
        let data: any;
        try {
            data = JSON.parse(_data.toString());
        } catch (err) {
            app.logger(loggerType.warn, componentName.master, "JSON parse error，close the monitor named " + this.sid);
            this.socket.close();
            return;
        }

        if (data.T === define.Monitor_To_Master.heartbeat) {
            this.heartbeatTimeout();
            this.heartbeatResponse();
        } else if (data.T === define.Monitor_To_Master.cliMsg) {
            masterCli.deal_monitor_msg(data);
        }
    }

    private onClose() {
        clearTimeout(this.heartbeatTimeoutTimer);
        delete servers[this.sid];
        delete serversDataTmp.serverInfoIdMap[this.sid];
        let serverInfo: monitor_remove_server = {
            "T": define.Master_To_Monitor.removeServer,
            "id": this.sid,
            "serverType": this.serverType
        };
        let serverInfoBuf: Buffer = msgCoder.encodeInnerData(serverInfo);
        for (let sid in servers) {
            if (servers[sid].serverType !== "rpc") {
                servers[sid].socket.send(serverInfoBuf);
            }
        }
        app.logger(loggerType.info, componentName.master, "a monitor disconnected : " + this.sid);
    }
}

/**
 * master处理cli代理
 */
export class Master_ClientProxy {
    private socket: SocketProxy;
    private heartbeatTimer: NodeJS.Timeout = null as any;
    constructor(socket: SocketProxy) {
        this.socket = socket;
        this.init();
    }

    private init() {
        let socket = this.socket;
        this.heartbeatTimeOut();

        socket.on('data', this.onData.bind(this));
        socket.on('close', this.onClose.bind(this));

        app.logger(loggerType.info, componentName.master, "master gets a new cli : " + socket.socket.remoteAddress);
    }

    private heartbeatTimeOut() {
        let self = this;
        clearTimeout(this.heartbeatTimer);
        this.heartbeatTimer = setTimeout(function () {
            app.logger(loggerType.warn, componentName.master, "heartbeat time out, close the cli:" + self.socket.socket.remoteAddress);
            self.socket.close();
        }, define.some_config.Time.Monitor_Heart_Beat_Time * 1000 * 2);
    }

    private onData(_data: Buffer) {
        let data: any;
        try {
            data = JSON.parse(_data.toString());
        } catch (err) {
            app.logger(loggerType.warn, componentName.master, "JSON parse error，close the cli : " + this.socket.socket.remoteAddress);
            this.socket.close();
            return;
        }

        try {
            if (data.T === define.Cli_To_Master.heartbeat) {
                this.heartbeatTimeOut();
            } else if (data.T === define.Cli_To_Master.cliMsg) {
                app.logger(loggerType.info, componentName.master, "master get command from the cli : " + this.socket.socket.remoteAddress + " / " + JSON.stringify(data));
                masterCli.deal_cli_msg(this, data);
            } else {
                app.logger(loggerType.info, componentName.master, "the cli illegal data type close it:  " + this.socket.socket.remoteAddress);
                this.socket.close();
            }
        } catch (e) {
            app.logger(loggerType.info, componentName.master, e);
            this.socket.close();
        }
    }

    send(msg: any) {
        this.socket.send(msgCoder.encodeInnerData(msg));
    }

    private onClose() {
        clearTimeout(this.heartbeatTimer);
        app.logger(loggerType.info, componentName.master, "a cli disconnected : " + this.socket.socket.remoteAddress);
    }
}