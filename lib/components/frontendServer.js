"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FrontendServer = void 0;
const define = require("../util/define");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const session_1 = require("./session");
const protocol = __importStar(require("../connector/protocol"));
class FrontendServer {
    constructor(app) {
        this.app = app;
    }
    /**
     * 启动
     */
    start(cb) {
        session_1.initSessionApp(this.app);
        let self = this;
        let startCb = function () {
            let str = `listening at [${self.app.serverInfo.host}:${self.app.serverInfo.clientPort}]  ${self.app.serverId} (clientPort)`;
            console.log(str);
            self.app.logger("info" /* info */, str);
            cb && cb();
        };
        protocol.init(this.app);
        let mydog = require("../mydog");
        let connectorConfig = this.app.someconfig.connector || {};
        let connectorConstructor = connectorConfig.connector || mydog.connector.connectorTcp;
        let defaultEncodeDecode = protocol.Tcp_EncodeDecode;
        if (connectorConstructor === mydog.connector.connectorTcp) {
            defaultEncodeDecode = protocol.Tcp_EncodeDecode;
        }
        else if (connectorConstructor === mydog.connector.connectorWs || connectorConstructor === mydog.connector.connectorWss) {
            defaultEncodeDecode = protocol.Ws_EncodeDecode;
        }
        let encodeDecodeConfig = this.app.someconfig.encodeDecode || {};
        this.app.protoEncode = encodeDecodeConfig.protoEncode || defaultEncodeDecode.protoEncode;
        this.app.msgEncode = encodeDecodeConfig.msgEncode || defaultEncodeDecode.msgEncode;
        this.app.protoDecode = encodeDecodeConfig.protoDecode || defaultEncodeDecode.protoDecode;
        this.app.msgDecode = encodeDecodeConfig.msgDecode || defaultEncodeDecode.msgDecode;
        new connectorConstructor({
            "app": this.app,
            "clientManager": new ClientManager(this.app),
            "config": this.app.someconfig.connector,
            "startCb": startCb
        });
    }
    /**
     * 同步session
     */
    applySession(data) {
        let session = JSON.parse(data.slice(1).toString());
        let client = this.app.clients[session.uid];
        if (client) {
            client.session.applySession(session.settings);
        }
    }
    /**
     * 前端服将后端服的消息转发给客户端
     */
    sendMsgByUids(data) {
        let uidBuffLen = data.readUInt16BE(1);
        let uids = JSON.parse(data.slice(3, 3 + uidBuffLen).toString());
        let msgBuf = data.slice(3 + uidBuffLen);
        let clients = this.app.clients;
        let client;
        let i;
        for (i = 0; i < uids.length; i++) {
            client = clients[uids[i]];
            if (client) {
                client.send(msgBuf);
            }
        }
    }
}
exports.FrontendServer = FrontendServer;
function clientOnOffCb() {
}
class ClientManager {
    constructor(app) {
        this.msgHandler = {};
        this.serverType = "";
        this.clientOnCb = null;
        this.clientOffCb = null;
        this.app = app;
        this.serverType = app.serverType;
        this.router = this.app.router;
        let connectorConfig = this.app.someconfig.connector || {};
        this.clientOnCb = connectorConfig.clientOnCb || clientOnOffCb;
        this.clientOffCb = connectorConfig.clientOffCb || clientOnOffCb;
        this.loadHandler();
    }
    /**
     * 前端服务器加载路由处理
     */
    loadHandler() {
        let dirName = path.join(this.app.base, define.some_config.File_Dir.Servers, this.serverType, "handler");
        let exists = fs.existsSync(dirName);
        if (exists) {
            let self = this;
            fs.readdirSync(dirName).forEach(function (filename) {
                if (!/\.js$/.test(filename)) {
                    return;
                }
                let name = path.basename(filename, '.js');
                let handler = require(path.join(dirName, filename));
                if (handler.default && typeof handler.default === "function") {
                    self.msgHandler[name] = new handler.default(self.app);
                }
            });
        }
    }
    addClient(client) {
        if (client.session) {
            this.app.logger("warn" /* warn */, "frontendServer -> the I_client has already been added, close it");
            client.close();
            return;
        }
        this.app.clientNum++;
        let session = new session_1.Session(this.app.serverId);
        session.socket = client;
        client.session = session;
        this.clientOnCb(session);
    }
    removeClient(client) {
        let session = client.session;
        if (!session) {
            return;
        }
        delete this.app.clients[session.uid];
        this.app.clientNum--;
        client.session = null;
        session.socket = null;
        this.clientOffCb(session);
    }
    handleMsg(client, msgBuf) {
        try {
            if (!client.session) {
                this.app.logger("warn" /* warn */, "frontendServer -> cannot handle msg before added, close it");
                client.close();
                return;
            }
            let data = this.app.protoDecode(msgBuf);
            let cmdArr = this.app.routeConfig[data.cmd].split('.');
            if (this.serverType === cmdArr[0]) {
                let msg = this.app.msgDecode(data.cmd, data.msg);
                this.msgHandler[cmdArr[1]][cmdArr[2]](msg, client.session, this.callBack(client, data.cmd));
            }
            else {
                this.doRemote(data, client.session, cmdArr);
            }
        }
        catch (e) {
            this.app.logger("error" /* error */, e.stack);
        }
    }
    /**
     * 回调
     */
    callBack(client, cmd) {
        let self = this;
        return function (msg) {
            if (msg === undefined) {
                msg = null;
            }
            let buf = self.app.protoEncode(cmd, msg);
            client.send(buf);
        };
    }
    /**
     * 转发客户端消息到后端服务器
     */
    doRemote(msg, session, cmdArr) {
        let id = this.router[cmdArr[0]](session);
        let socket = this.app.rpcPool.getSocket(id);
        if (!socket) {
            return;
        }
        let svr = this.app.serversIdMap[id];
        if (svr.serverType !== cmdArr[0] || svr.frontend) {
            this.app.logger("warn" /* warn */, "frontendServer -> illegal remote");
            return;
        }
        let sessionBuf = session.sessionBuf;
        let buf = Buffer.allocUnsafe(9 + sessionBuf.length + msg.msg.length);
        buf.writeUInt32BE(5 + sessionBuf.length + msg.msg.length, 0);
        buf.writeUInt8(4 /* clientMsgIn */, 4);
        buf.writeUInt16BE(sessionBuf.length, 5);
        sessionBuf.copy(buf, 7);
        buf.writeUInt16BE(msg.cmd, 7 + sessionBuf.length);
        msg.msg.copy(buf, 9 + sessionBuf.length);
        socket.send(buf);
    }
}
