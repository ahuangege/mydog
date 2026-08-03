/**
 * The master central server, accepts the monitor connection, is responsible for the mutual understanding between the servers, and accepts cli commands
 */


import Application from "../application";
import { MasterCli } from "./cliUtil";
import { SocketProxy, monitor_get_new_server, monitor_remove_server, monitor_reg_master, loggerLevel, ServerInfo } from "../util/interfaceDefine";
import tcpServer from "./tcpServer";
import { runServers } from "../util/starter";
import * as define from "../util/define";
import * as msgCoder from "./msgCoder";
import * as path from "path";
let meFilename = `[${path.basename(__filename, ".js")}.ts]`;


export class Master {
    app: Application = null as any;
    serverToken = "";
    cliToken = "";

    masterCli: MasterCli = null as any;

    private serversMap = new Map<string, Master_ServerProxy>(); // 当前连接成功的服务器

    constructor(app: Application) {
        this.app = app;
    }

    start(cb?: Function) {
        this.masterCli = new MasterCli(this.app, this);
        this.startServer(cb);
    }

    startServer(cb?: Function) {
        let tokenConfig = this.app.someconfig.recognizeToken || {};
        this.serverToken = tokenConfig.serverToken || define.some_config.Server_Token;
        this.cliToken = tokenConfig.cliToken || define.some_config.Cli_Token;


        const startCb = () => {
            let str = `listening at [${this.app.serverInfo.host}:${this.app.serverInfo.port}]  ${this.app.serverId}`;
            console.log(str);
            cb && cb();
            if (this.app.startMode === "all") {
                runServers(this.app);
            }
        }


        const newClientCb = (socket: SocketProxy) => {
            new UnregSocket_proxy(socket, this);
        }

        tcpServer(this.app.serverInfo.port, false, startCb, newClientCb);

    }

    getServer(serverId: string) {
        return this.serversMap.get(serverId);
    }

    getServersMap() {
        return this.serversMap;
    }

    onAddServer(server: Master_ServerProxy) {
        if (this.serversMap.has(server.sid)) {
            return;
        }
        this.serversMap.set(server.sid, server);
    }

    onRemoveServer(server: Master_ServerProxy) {
        if (this.serversMap.get(server.sid) !== server) {
            return;
        }
        this.serversMap.delete(server.sid);
    }
}





/**
 * Unregistered socket proxy
 */
class UnregSocket_proxy {
    private app: Application;
    private socket: SocketProxy;
    master: Master;
    private registerTimer: NodeJS.Timeout = null as any;
    private onDataFunc: (data: Buffer) => void;
    private onCloseFunc: () => void;
    constructor(socket: SocketProxy, master: Master) {
        this.socket = socket;
        this.master = master;
        this.app = master.app;

        this.onDataFunc = this.onData.bind(this);
        this.onCloseFunc = this.onClose.bind(this);
        socket.on("data", this.onDataFunc);
        socket.on("close", this.onCloseFunc);
        this.registerTimeout();
    }

    private registerTimeout() {
        let self = this;
        this.registerTimer = setTimeout(() => {
            this.app.logger(loggerLevel.error, `${meFilename} unregistered socket, register timeout, close it, ${self.socket.remoteAddress}`);
            self.socket.close();
        }, 5000);

    }

    private onData(_data: Buffer) {
        let socket = this.socket;

        let invalidCloseInfo = {
            "T": define.Master_To_Monitor.invalidCloseSelf,
            "errMsg": ""
        };

        let data: monitor_reg_master;
        try {
            data = JSON.parse(_data.toString());
        } catch (err) {
            this.app.logger(loggerLevel.error, `${meFilename} unregistered socket, JSON parse error, close it, ${socket.remoteAddress}`);
            invalidCloseInfo.errMsg = "JSON parse error";
            socket.send(msgCoder.encodeInnerData(invalidCloseInfo));
            socket.close();
            return;
        }

        // The first packet must be registered
        if (!data || data.T !== define.Monitor_To_Master.register) {
            this.app.logger(loggerLevel.error, `${meFilename} unregistered socket, illegal data, close it, ${socket.remoteAddress}`);
            invalidCloseInfo.errMsg = "invalid data type";
            socket.send(msgCoder.encodeInnerData(invalidCloseInfo));
            socket.close();
            return;
        }

        // Is it a server?
        if (data.serverToken) {
            if (data.serverToken !== this.master.serverToken) {
                this.app.logger(loggerLevel.error, `${meFilename} unregistered socket, illegal serverToken, close it, ${socket.remoteAddress}`);
                invalidCloseInfo.errMsg = "serverToken wrong";
                socket.send(msgCoder.encodeInnerData(invalidCloseInfo));
                socket.close();
                return;
            }
            if (!data.serverInfo || !data.serverInfo.id || !data.serverInfo.host || !data.serverInfo.port || !data.serverInfo.serverType) {
                this.app.logger(loggerLevel.error, `${meFilename} unregistered socket, illegal serverInfo, close it, ${socket.remoteAddress}`);
                invalidCloseInfo.errMsg = "invalid serverInfo";
                socket.send(msgCoder.encodeInnerData(invalidCloseInfo));
                socket.close();
                return;
            }
            if (this.master.getServer(data.serverInfo.id)) {
                this.app.logger(loggerLevel.error, `${meFilename} already has a monitor named: ${data.serverInfo.id}, close it, ${socket.remoteAddress}`);
                invalidCloseInfo.errMsg = "already same monitor";
                socket.send(msgCoder.encodeInnerData(invalidCloseInfo));
                socket.close();
                return;
            }
            this.registerOk();
            new Master_ServerProxy(data, socket, this.master);
            return;
        }

        // Is it a cli？
        if (data.cliToken) {
            if (data.cliToken !== this.master.cliToken) {
                this.app.logger(loggerLevel.error, `${meFilename} unregistered socket, illegal cliToken, close it, ${socket.remoteAddress}`);
                socket.close();
                return;
            }
            this.registerOk();
            new Master_CLI_Proxy(socket, this.master);
            return;
        }

        this.app.logger(loggerLevel.error, `${meFilename} unregistered socket, illegal socket, close it, ${socket.remoteAddress}`);
        socket.close();
    }

    private onClose() {
        clearTimeout(this.registerTimer);
        this.app.logger(loggerLevel.error, `${meFilename} unregistered socket closed, ${this.socket.remoteAddress}`);
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
    master: Master;
    app: Application;
    private socket: SocketProxy;
    public sid: string = "";
    public serverType: string = "";
    private heartbeatTimeoutTimer: NodeJS.Timeout = null as any;

    serverInfo: ServerInfo = null as any;
    constructor(data: monitor_reg_master, socket: SocketProxy, master: Master) {
        this.master = master;
        this.app = master.app;
        this.socket = socket;
        this.init(data);
    }

    private init(data: monitor_reg_master) {
        let socket = this.socket;
        socket.maxLen = define.some_config.SocketBufferMaxLen;

        this.heartbeatTimeout();
        socket.on('data', this.onData.bind(this));
        socket.on('close', this.onClose.bind(this));


        this.sid = data.serverInfo.id;
        this.serverType = data.serverInfo.serverType;
        this.serverInfo = data.serverInfo;

        this.master.onAddServer(this);

        this.app.logger(loggerLevel.debug, `${meFilename} get a new monitor named: ${this.sid}, ${this.socket.remoteAddress}`);
    }

    private heartbeatTimeout() {
        this.heartbeatTimeoutTimer = setTimeout(() => {
            this.app.logger(loggerLevel.error, `${meFilename} heartbeat timeout, close the monitor named: ${this.sid}, ${this.socket.remoteAddress}`);
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
            this.app.logger(loggerLevel.error, `${meFilename} JSON parse error，close the monitor named: ${this.sid}, ${this.socket.remoteAddress}`);
            this.socket.close();
            return;
        }

        try {
            if (data.T === define.Monitor_To_Master.heartbeat) {
                this.heartbeatTimeoutTimer.refresh();
                this.heartbeatResponse();
            } else if (data.T === define.Monitor_To_Master.cliMsg) {
                this.master.masterCli.deal_monitor_msg(data);
            } else {
                this.app.logger(loggerLevel.error, `${meFilename} the monitor illegal data type close it: ${this.sid} ${this.socket.remoteAddress}`);
                this.socket.close();
            }
        } catch (e: any) {
            this.app.logger(loggerLevel.error, e);
            this.socket.close();
        }
    }

    private onClose() {
        clearTimeout(this.heartbeatTimeoutTimer);
        this.master.onRemoveServer(this);
        this.app.logger(loggerLevel.error, `${meFilename} a monitor disconnected: ${this.sid}, ${this.socket.remoteAddress}`);
    }
}

/**
 * master handles cli agent
 */
export class Master_CLI_Proxy {
    app: Application;
    master: Master;
    private socket: SocketProxy;
    private heartbeatTimeoutTimer: NodeJS.Timeout = null as any;
    constructor(socket: SocketProxy, master: Master) {
        this.app = master.app;
        this.master = master;
        this.socket = socket;
        this.init();
    }

    private init() {
        let socket = this.socket;
        socket.maxLen = define.some_config.SocketBufferMaxLen;

        this.heartbeatTimeOut();

        socket.on('data', this.onData.bind(this));
        socket.on('close', this.onClose.bind(this));

        this.app.logger(loggerLevel.info, `${meFilename}  get a new cli: ${socket.remoteAddress}`);
    }

    private heartbeatTimeOut() {
        this.heartbeatTimeoutTimer = setTimeout(() => {
            this.app.logger(loggerLevel.error, `${meFilename} heartbeat timeout, close the cli: ${this.socket.remoteAddress}`);
            this.socket.close();
        }, define.some_config.Time.Monitor_Heart_Beat_Time * 1000 * 2);
    }

    private onData(_data: Buffer) {
        let data: any;
        try {
            data = JSON.parse(_data.toString());
        } catch (err) {
            this.app.logger(loggerLevel.error, `${meFilename} JSON parse error，close the cli: ${this.socket.remoteAddress}`);
            this.socket.close();
            return;
        }

        try {
            if (data.T === define.Cli_To_Master.heartbeat) {
                this.heartbeatTimeoutTimer.refresh();
            } else if (data.T === define.Cli_To_Master.cliMsg) {
                this.app.logger(loggerLevel.info, `${meFilename} get command from the cli: ${this.socket.remoteAddress} ==> ${_data.toString()}`);
                this.master.masterCli.deal_cli_msg(this, data);
            } else {
                this.app.logger(loggerLevel.error, `${meFilename} the cli illegal data type close it: ${this.socket.remoteAddress}`);
                this.socket.close();
            }
        } catch (e: any) {
            this.app.logger(loggerLevel.error, `${meFilename} cli handle msg err, close it: ${this.socket.remoteAddress}\n ${e.stack}`);
            this.socket.close();
        }
    }

    send(msg: any) {
        this.socket.send(msgCoder.encodeInnerData(msg));
    }

    private onClose() {
        clearTimeout(this.heartbeatTimeoutTimer);
        this.app.logger(loggerLevel.info, `${meFilename}  a cli disconnected: ${this.socket.remoteAddress}`);
    }
}