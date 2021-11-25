/**
 * The master central server, accepts the monitor connection, is responsible for the mutual understanding between the servers, and accepts cli commands
 */


import Application from "../application";
import { MasterCli } from "./cliUtil";
import { SocketProxy, monitor_get_new_server, monitor_remove_server, monitor_reg_master, loggerLevel, loggerType } from "../util/interfaceDefine";
import tcpServer from "./tcpServer";
import { runServers } from "../util/starter";
import define = require("../util/define");
import * as msgCoder from "./msgCoder";

let servers: { [id: string]: Master_ServerProxy } = {};
let serversDataTmp: monitor_get_new_server = { "T": define.Master_To_Monitor.addServer, "servers": {} };
let masterCli: MasterCli;
let app: Application;

export function start(_app: Application, cb?: Function) {
    app = _app;
    masterCli = new MasterCli(_app, servers);
    startServer(cb);
}

function startServer(cb?: Function) {

    tcpServer(app.serverInfo.port, false, startCb, newClientCb);

    function startCb() {
        let str = `listening at [${app.serverInfo.host}:${app.serverInfo.port}]  ${app.serverId}`;
        console.log(str);
        app.logger(loggerType.frame, loggerLevel.info, str);
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
 * Unregistered socket proxy
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
            app.logger(loggerType.frame, loggerLevel.error, `master -> register timeout, close it, ${self.socket.remoteAddress}`);
            self.socket.close();
        }, 5000);

    }

    private onData(_data: Buffer) {
        let socket = this.socket;

        let data: monitor_reg_master;
        try {
            data = JSON.parse(_data.toString());
        } catch (err) {
            app.logger(loggerType.frame, loggerLevel.error, `master -> unregistered socket, JSON parse error, close it, ${socket.remoteAddress}`);
            socket.close();
            return;
        }

        // The first packet must be registered
        if (!data || data.T !== define.Monitor_To_Master.register) {
            app.logger(loggerType.frame, loggerLevel.error, `master -> unregistered socket, illegal data, close it, ${socket.remoteAddress}`);
            socket.close();
            return;
        }

        // Is it a server?
        if (data.serverToken) {
            let tokenConfig = app.someconfig.recognizeToken || {};
            let serverToken = tokenConfig.serverToken || define.some_config.Server_Token;
            if (data.serverToken !== serverToken) {
                app.logger(loggerType.frame, loggerLevel.error, `master -> illegal serverToken, close it, ${socket.remoteAddress}`);
                socket.close();
                return;
            }
            if (!data.serverInfo || !data.serverInfo.id || !data.serverInfo.host || !data.serverInfo.port || !data.serverInfo.serverType) {
                app.logger(loggerType.frame, loggerLevel.error, `master -> illegal serverInfo, close it, ${socket.remoteAddress}`);
                socket.close();
                return;
            }
            this.registerOk();
            new Master_ServerProxy(data, socket);
            return;
        }

        // Is it a cli？
        if (data.cliToken) {
            let tokenConfig = app.someconfig.recognizeToken || {};
            let cliToken = tokenConfig.cliToken || define.some_config.Cli_Token;
            if (data.cliToken !== cliToken) {
                app.logger(loggerType.frame, loggerLevel.error, `master -> illegal cliToken, close it, ${socket.remoteAddress}`);
                socket.close();
                return;
            }
            this.registerOk();
            new Master_ClientProxy(socket);
            return;
        }

        app.logger(loggerType.frame, loggerLevel.error, `master -> illegal socket, close it, ${socket.remoteAddress}`);
        socket.close();
    }

    private onClose() {
        clearTimeout(this.registerTimer);
        app.logger(loggerType.frame, loggerLevel.error, `master -> unregistered socket closed, ${this.socket.remoteAddress}`);
    }

    private registerOk() {
        clearTimeout(this.registerTimer);
        this.socket.removeListener("data", this.onDataFunc);
        this.socket.removeListener("close", this.onCloseFunc);
        this.socket = null as any;
    }

}




/**
 * master processing server agent
 */
export class Master_ServerProxy {
    private socket: SocketProxy;
    private sid: string = "";
    public serverType: string = "";
    private heartbeatTimeoutTimer: NodeJS.Timeout = null as any;
    constructor(data: monitor_reg_master, socket: SocketProxy) {
        this.socket = socket;
        this.init(data);
    }

    private init(data: monitor_reg_master) {
        let socket = this.socket;

        if (!!servers[data.serverInfo.id]) {
            app.logger(loggerType.frame, loggerLevel.error, `master -> already has a monitor named: ${data.serverInfo.id}, close it, ${socket.remoteAddress}`);
            socket.close();
            return;
        }
        socket.maxLen = define.some_config.SocketBufferMaxLen;

        this.heartbeatTimeout();
        socket.on('data', this.onData.bind(this));
        socket.on('close', this.onClose.bind(this));


        this.sid = data.serverInfo.id;
        this.serverType = data.serverInfo.serverType;

        // Construct a new server message
        let socketInfo: monitor_get_new_server = {
            "T": define.Master_To_Monitor.addServer,
            "servers": {}
        };
        socketInfo.servers[this.sid] = data.serverInfo;
        let socketInfoBuf: Buffer = msgCoder.encodeInnerData(socketInfo);

        // Notify other servers that there are new servers
        for (let sid in servers) {
            servers[sid].socket.send(socketInfoBuf);
        }

        // Notify the newly added server, which servers are currently available
        let result = msgCoder.encodeInnerData(serversDataTmp);
        this.socket.send(result);


        servers[this.sid] = this;
        serversDataTmp.servers[this.sid] = data.serverInfo;

        app.logger(loggerType.frame, loggerLevel.info, `master -> get a new monitor named: ${this.sid}, ${this.socket.remoteAddress}`);
    }

    private heartbeatTimeout() {
        this.heartbeatTimeoutTimer = setTimeout(() => {
            app.logger(loggerType.frame, loggerLevel.error, `master -> heartbeat timeout, close the monitor named: ${this.sid}, ${this.socket.remoteAddress}`);
            this.socket.close();
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
            app.logger(loggerType.frame, loggerLevel.error, `master -> JSON parse error，close the monitor named: ${this.sid}, ${this.socket.remoteAddress}`);
            this.socket.close();
            return;
        }

        try {
            if (data.T === define.Monitor_To_Master.heartbeat) {
                this.heartbeatTimeoutTimer.refresh();
                this.heartbeatResponse();
            } else if (data.T === define.Monitor_To_Master.cliMsg) {
                masterCli.deal_monitor_msg(data);
            }
        } catch (err: any) {
            app.logger(loggerType.frame, loggerLevel.error, `master -> handle msg error, close it: ${this.sid}, ${this.socket.remoteAddress}\n${err.stack}`);
            this.socket.close();
        }
    }

    private onClose() {
        clearTimeout(this.heartbeatTimeoutTimer);
        delete servers[this.sid];
        delete serversDataTmp.servers[this.sid];
        let serverInfo: monitor_remove_server = {
            "T": define.Master_To_Monitor.removeServer,
            "id": this.sid,
            "serverType": this.serverType
        };
        let serverInfoBuf: Buffer = msgCoder.encodeInnerData(serverInfo);
        for (let sid in servers) {
            servers[sid].socket.send(serverInfoBuf);
        }
        app.logger(loggerType.frame, loggerLevel.error, `master -> a monitor disconnected: ${this.sid}, ${this.socket.remoteAddress}`);
    }
}

/**
 * master handles cli agent
 */
export class Master_ClientProxy {
    private socket: SocketProxy;
    private heartbeatTimeoutTimer: NodeJS.Timeout = null as any;
    constructor(socket: SocketProxy) {
        this.socket = socket;
        this.init();
    }

    private init() {
        let socket = this.socket;
        socket.maxLen = define.some_config.SocketBufferMaxLen;

        this.heartbeatTimeOut();

        socket.on('data', this.onData.bind(this));
        socket.on('close', this.onClose.bind(this));

        app.logger(loggerType.frame, loggerLevel.info, `master -> get a new cli: ${socket.remoteAddress}`);
    }

    private heartbeatTimeOut() {
        this.heartbeatTimeoutTimer = setTimeout(() => {
            app.logger(loggerType.frame, loggerLevel.error, `master -> heartbeat timeout, close the cli: ${this.socket.remoteAddress}`);
            this.socket.close();
        }, define.some_config.Time.Monitor_Heart_Beat_Time * 1000 * 2);
    }

    private onData(_data: Buffer) {
        let data: any;
        try {
            data = JSON.parse(_data.toString());
        } catch (err) {
            app.logger(loggerType.frame, loggerLevel.error, `master -> JSON parse error，close the cli: ${this.socket.remoteAddress}`);
            this.socket.close();
            return;
        }

        try {
            if (data.T === define.Cli_To_Master.heartbeat) {
                this.heartbeatTimeoutTimer.refresh();
            } else if (data.T === define.Cli_To_Master.cliMsg) {
                app.logger(loggerType.frame, loggerLevel.info, `master -> master get command from the cli: ${this.socket.remoteAddress} ==> ${JSON.stringify(data)}`);
                masterCli.deal_cli_msg(this, data);
            } else {
                app.logger(loggerType.frame, loggerLevel.error, `master -> the cli illegal data type close it: ${this.socket.remoteAddress}`);
                this.socket.close();
            }
        } catch (e: any) {
            app.logger(loggerType.frame, loggerLevel.error, `master -> cli handle msg err, close it: ${this.socket.remoteAddress}\n ${e.stack}`);
            this.socket.close();
        }
    }

    send(msg: any) {
        this.socket.send(msgCoder.encodeInnerData(msg));
    }

    private onClose() {
        clearTimeout(this.heartbeatTimeoutTimer);
        app.logger(loggerType.frame, loggerLevel.info, `master -> a cli disconnected: ${this.socket.remoteAddress}`);
    }
}