"use strict";
/**
 * 后端服务器启动监听端口，并接受前端服务器的连接
 */
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
var msgCoder_1 = require("./msgCoder");
var path = __importStar(require("path"));
var fs = __importStar(require("fs"));
var define = require("../util/define");
var session_1 = require("./session");
var protocol = __importStar(require("../connector/protocol"));
var BackendServer = /** @class */ (function () {
    function BackendServer(app) {
        this.msgHandler = {};
        this.app = app;
    }
    BackendServer.prototype.init = function () {
        session_1.initSessionApp(this.app);
        protocol.init(this.app);
        var mydog = require("../mydog");
        var connectorConstructor = this.app.connectorConfig.connector || mydog.connector.connectorTcp;
        var defaultEncodeDecode;
        if (connectorConstructor === mydog.connector.connectorTcp) {
            defaultEncodeDecode = protocol.Tcp_EncodeDecode;
        }
        else if (connectorConstructor === mydog.connector.connectorWs) {
            defaultEncodeDecode = protocol.Ws_EncodeDecode;
        }
        else {
            defaultEncodeDecode = protocol.Tcp_EncodeDecode;
        }
        this.app.protoEncode = this.app.encodeDecodeConfig.protoEncode || defaultEncodeDecode.protoEncode;
        this.app.msgEncode = this.app.encodeDecodeConfig.msgEncode || defaultEncodeDecode.msgEncode;
        this.app.protoDecode = this.app.encodeDecodeConfig.protoDecode || defaultEncodeDecode.protoDecode;
        this.app.msgDecode = this.app.encodeDecodeConfig.msgDecode || defaultEncodeDecode.msgDecode;
        this.loadHandler();
    };
    /**
     * 后端服务器加载路由处理
     */
    BackendServer.prototype.loadHandler = function () {
        var dirName = path.join(this.app.base, define.some_config.File_Dir.Servers, this.app.serverType, "handler");
        var exists = fs.existsSync(dirName);
        if (exists) {
            var self_1 = this;
            fs.readdirSync(dirName).forEach(function (filename) {
                if (!/\.js$/.test(filename)) {
                    return;
                }
                var name = path.basename(filename, '.js');
                var handler = require(path.join(dirName, filename));
                if (handler.default && typeof handler.default === "function") {
                    self_1.msgHandler[name] = new handler.default(self_1.app);
                }
            });
        }
    };
    /**
     * 后端服务器收到前端服转发的客户端消息
     */
    BackendServer.prototype.handleMsg = function (id, msg) {
        var sessionLen = msg.readUInt16BE(1);
        var sessionBuf = msg.slice(3, 3 + sessionLen);
        var session = new session_1.Session();
        session.setAll(JSON.parse(sessionBuf.toString()));
        var cmdId = msg.readUInt16BE(3 + sessionLen);
        var cmdArr = this.app.routeConfig[cmdId].split('.');
        var data = this.app.msgDecode(cmdId, msg.slice(5 + sessionLen));
        this.msgHandler[cmdArr[1]][cmdArr[2]](data, session, this.callback(id, cmdId, session.uid));
    };
    BackendServer.prototype.callback = function (id, cmdId, uid) {
        var self = this;
        return function (msg) {
            if (msg === undefined) {
                msg = null;
            }
            var msgBuf = self.app.protoEncode(cmdId, msg);
            var buf = msgCoder_1.encodeRemoteData([uid], msgBuf);
            self.app.rpcPool.sendMsg(id, buf);
        };
    };
    /**
     * 后端session同步到前端
     */
    BackendServer.prototype.sendSession = function (session) {
        var msgBuf = Buffer.from(JSON.stringify(session));
        var buf = Buffer.allocUnsafe(5 + msgBuf.length);
        buf.writeUInt32BE(1 + msgBuf.length, 0);
        buf.writeUInt8(3 /* applySession */, 4);
        msgBuf.copy(buf, 5);
        this.app.rpcPool.sendMsg(session.sid, buf);
    };
    /**
     * 后端服务器给客户端发消息
     */
    BackendServer.prototype.sendMsgByUidSid = function (cmdIndex, msg, uidsid) {
        var groups = {};
        var group;
        for (var _i = 0, uidsid_1 = uidsid; _i < uidsid_1.length; _i++) {
            var one = uidsid_1[_i];
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
        var app = this.app;
        var msgBuf = app.protoEncode(cmdIndex, msg);
        for (var sid in groups) {
            var buf = msgCoder_1.encodeRemoteData(groups[sid], msgBuf);
            app.rpcPool.sendMsg(sid, buf);
        }
    };
    return BackendServer;
}());
exports.BackendServer = BackendServer;
