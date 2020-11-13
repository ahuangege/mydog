"use strict";
/**
 * 后端服务器启动监听端口，并接受前端服务器的连接
 */
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
exports.BackendServer = void 0;
const msgCoder_1 = require("./msgCoder");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const define = require("../util/define");
const session_1 = require("./session");
const protocol = __importStar(require("../connector/protocol"));
class BackendServer {
    constructor(app) {
        this.msgHandler = {};
        this.app = app;
    }
    init() {
        session_1.initSessionApp(this.app);
        protocol.init(this.app);
        let mydog = require("../mydog");
        let connectorConfig = this.app.someconfig.connector || {};
        let connectorConstructor = connectorConfig.connector || mydog.connector.connectorTcp;
        let defaultEncodeDecode;
        if (connectorConstructor === mydog.connector.connectorTcp) {
            defaultEncodeDecode = protocol.Tcp_EncodeDecode;
        }
        else if (connectorConstructor === mydog.connector.connectorWs) {
            defaultEncodeDecode = protocol.Ws_EncodeDecode;
        }
        else {
            defaultEncodeDecode = protocol.Tcp_EncodeDecode;
        }
        let encodeDecodeConfig = this.app.someconfig.encodeDecode || {};
        this.app.protoEncode = encodeDecodeConfig.protoEncode || defaultEncodeDecode.protoEncode;
        this.app.msgEncode = encodeDecodeConfig.msgEncode || defaultEncodeDecode.msgEncode;
        this.app.protoDecode = encodeDecodeConfig.protoDecode || defaultEncodeDecode.protoDecode;
        this.app.msgDecode = encodeDecodeConfig.msgDecode || defaultEncodeDecode.msgDecode;
        this.loadHandler();
    }
    /**
     * 后端服务器加载路由处理
     */
    loadHandler() {
        let dirName = path.join(this.app.base, define.some_config.File_Dir.Servers, this.app.serverType, "handler");
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
    /**
     * 后端服务器收到前端服转发的客户端消息
     */
    handleMsg(id, msg) {
        let sessionLen = msg.readUInt16BE(1);
        let sessionBuf = msg.slice(3, 3 + sessionLen);
        let session = new session_1.Session();
        session.setAll(JSON.parse(sessionBuf.toString()));
        let cmd = msg.readUInt16BE(3 + sessionLen);
        let cmdArr = this.app.routeConfig[cmd].split('.');
        let data = this.app.msgDecode(cmd, msg.slice(5 + sessionLen));
        this.msgHandler[cmdArr[1]][cmdArr[2]](data, session, this.callback(id, cmd, session.uid));
    }
    callback(id, cmd, uid) {
        let self = this;
        return function (msg) {
            if (msg === undefined) {
                msg = null;
            }
            let msgBuf = self.app.protoEncode(cmd, msg);
            let buf = msgCoder_1.encodeRemoteData([uid], msgBuf);
            self.app.rpcPool.sendMsg(id, buf);
        };
    }
    /**
     * 后端session同步到前端
     */
    sendSession(sid, sessionBuf) {
        let buf = Buffer.allocUnsafe(5 + sessionBuf.length);
        buf.writeUInt32BE(1 + sessionBuf.length, 0);
        buf.writeUInt8(3 /* applySession */, 4);
        sessionBuf.copy(buf, 5);
        this.app.rpcPool.sendMsg(sid, buf);
    }
    /**
     * 后端服务器给客户端发消息
     */
    sendMsgByUidSid(cmd, msg, uidsid) {
        let groups = {};
        let group;
        let one;
        for (one of uidsid) {
            if (!one.sid) {
                continue;
            }
            group = groups[one.sid];
            if (!group) {
                group = [];
                groups[one.sid] = group;
            }
            group.push(one.uid);
        }
        let app = this.app;
        let msgBuf = app.protoEncode(cmd, msg);
        let sid;
        let buf;
        for (sid in groups) {
            buf = msgCoder_1.encodeRemoteData(groups[sid], msgBuf);
            app.rpcPool.sendMsg(sid, buf);
        }
    }
    /**
     * 后端服务器给客户端发消息
     */
    sendMsgByGroup(cmd, msg, group) {
        let app = this.app;
        let msgBuf = app.protoEncode(cmd, msg);
        let sid;
        let buf;
        for (sid in group) {
            if (group[sid].length === 0) {
                continue;
            }
            buf = msgCoder_1.encodeRemoteData(group[sid], msgBuf);
            app.rpcPool.sendMsg(sid, buf);
        }
    }
}
exports.BackendServer = BackendServer;
