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
        console.log("server start: " + app.host + ":" + app.port + " / " + app.serverId);
        cb && cb();
        if (app.startMode === "all") {
            runServers(app);
        }
    }

    function newClientCb(socket: SocketProxy) {
        socket.unRegSocketMsgHandle = unRegSocketMsgHandle.bind(null, socket);
        socket.on('data', socket.unRegSocketMsgHandle);

        socket.unRegSocketCloseHandle = unRegSocketCloseHandle.bind(null, socket);
        socket.on('close', socket.unRegSocketCloseHandle);

        socket.registerTimer = setTimeout(function () {
            app.logger(loggerType.debug, componentName.master, "register time out, close it");
            socket.close();
        }, 10000);

        heartBeatTimeOut(socket);
    }
}

/**
 * 心跳
 */
function heartBeatTimeOut(socket: SocketProxy) {
    clearTimeout(socket.heartBeatTimer);
    socket.heartBeatTimer = setTimeout(function () {
        app.logger(loggerType.debug, componentName.master, "heartbeat time out, close it");
        socket.close();
    }, define.some_config.Time.Monitor_Heart_Beat_Time * 1000 * 2);
}


/**
 * socket尚未注册时，关闭的回调
 */
function unRegSocketCloseHandle(socket: SocketProxy) {
    clearTimeout(socket.registerTimer);
    clearTimeout(socket.heartBeatTimer);
};

/**
 * socket尚未注册时，收到消息的回调
 */
function unRegSocketMsgHandle(socket: SocketProxy, _data: Buffer) {
    let data: any;
    try {
        data = JSON.parse(_data.toString());
    } catch (err) {
        app.logger(loggerType.debug, componentName.master, "JSON parse error, close it");
        socket.close();
        return;
    }

    if (!data || data.T !== define.Monitor_To_Master.register) {
        app.logger(loggerType.debug, componentName.master, "illegal data, close it");
        socket.close();
        return;
    }

    // 判断是服务器，还是cli
    if (data.hasOwnProperty("serverToken")) {
        if (data.serverToken !== app.serverToken || !data.serverType || !data.serverInfo
            || !data.serverInfo.id || !data.serverInfo.host || !data.serverInfo.port) {
            app.logger(loggerType.debug, componentName.master, "illegal monitor, close it");
            socket.close();
            return;
        }
        new Master_ServerProxy(data, socket);
        return;
    }

    // 是cli？
    if (data.hasOwnProperty("clientToken")) {
        if (data.clientToken !== app.clientToken) {
            app.logger(loggerType.debug, componentName.master, "illegal cli, close it");
            socket.close();
            return;
        }
        new Master_ClientProxy(socket);
        return;
    }

    app.logger(loggerType.debug, componentName.master, "illegal socket, close it");
    socket.close();
};

/**
 * master处理服务器代理
 */
export class Master_ServerProxy {
    private socket: SocketProxy;
    private sid: string = "";
    private serverType: string = "";
    constructor(data: monitor_reg_master, socket: SocketProxy) {
        this.socket = socket;
        this.init(data);
    }

    private init(data: monitor_reg_master) {
        let socket = this.socket;

        clearTimeout(socket.registerTimer);

        if (!!servers[data.serverInfo.id]) {
            app.logger(loggerType.warn, componentName.master, "master already has a monitor named " + data.serverInfo.id);
            socket.close();
            return;
        }

        socket.removeListener("data", socket.unRegSocketMsgHandle);
        socket.unRegSocketMsgHandle = null;
        socket.on('data', this.processMsg.bind(this));

        socket.removeListener("close", socket.unRegSocketCloseHandle);
        socket.unRegSocketCloseHandle = null;
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

    send(msg: any) {
        this.socket.send(msgCoder.encodeInnerData(msg));
    }

    private processMsg(_data: Buffer) {
        let data: any;
        try {
            data = JSON.parse(_data.toString());
        } catch (err) {
            app.logger(loggerType.debug, componentName.master, "JSON parse error，close the monitor named " + this.sid);
            this.socket.close();
            return;
        }
        if (data.T === define.Monitor_To_Master.heartbeat) {
            heartBeatTimeOut(this.socket);
        } else if (data.T === define.Monitor_To_Master.cliMsg) {
            masterCli.deal_monitor_msg(data);
        }
    }

    private onClose() {
        clearTimeout(this.socket.heartBeatTimer);
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
    constructor(socket: SocketProxy) {
        this.socket = socket;
        this.init();
    }

    private init() {
        let socket = this.socket;

        clearTimeout(socket.registerTimer);

        socket.removeListener("data", socket.unRegSocketMsgHandle);
        socket.unRegSocketMsgHandle = null;
        socket.on('data', this.processMsg.bind(this));

        socket.removeListener("close", socket.unRegSocketCloseHandle);
        socket.unRegSocketCloseHandle = null;
        socket.on('close', this.onClose.bind(this));

        app.logger(loggerType.info, componentName.master, "master gets a new cli");
    }

    private processMsg(_data: Buffer) {
        let data: any;
        try {
            data = JSON.parse(_data.toString());
        } catch (err) {
            app.logger(loggerType.debug, componentName.master, "JSON parse error，close the cli");
            this.socket.close();
            return;
        }
        if (data.T === define.Cli_To_Master.heartbeat) {
            heartBeatTimeOut(this.socket);
        } else if (data.T === define.Cli_To_Master.cliMsg) {
            masterCli.deal_cli_msg(this, data);
        }
    }

    send(msg: any) {
        this.socket.send(msgCoder.encodeInnerData(msg));
    }

    private onClose() {
        clearTimeout(this.socket.heartBeatTimer);
        app.logger(loggerType.info, componentName.master, "a cli disconnected");
    }
}