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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var msgCoder_1 = require("./msgCoder");
var path = __importStar(require("path"));
var fs = __importStar(require("fs"));
var define = require("../util/define");
var tcpServer_1 = __importDefault(require("./tcpServer"));
var interfaceDefine_1 = require("../util/interfaceDefine");
var session_1 = require("./session");
var remoteBackend = __importStar(require("./remoteBackend"));
var app;
var routeConfig;
var msgHandler = {};
var decode = null;
function start(_app, cb) {
    app = _app;
    routeConfig = app.routeConfig;
    var encodeDecodeConfig = app.encodeDecodeConfig;
    if (encodeDecodeConfig) {
        decode = encodeDecodeConfig.decode || null;
        msgCoder_1.setEncode(encodeDecodeConfig.encode);
    }
    session_1.initSessionApp(app);
    loadHandler();
    startServer(cb);
}
exports.start = start;
/**
 * 后端服务器加载路由处理
 */
function loadHandler() {
    var dirName = path.join(app.base, define.some_config.File_Dir.Servers, app.serverType, "handler");
    var exists = fs.existsSync(dirName);
    if (exists) {
        fs.readdirSync(dirName).forEach(function (filename) {
            if (!/\.js$/.test(filename)) {
                return;
            }
            var name = path.basename(filename, '.js');
            var handler = require(path.join(dirName, filename));
            if (handler.default && typeof handler.default === "function") {
                msgHandler[name] = new handler.default(app);
            }
            else if (typeof handler === "function") {
                msgHandler[name] = new handler(app);
            }
        });
    }
}
/**
 * 服务器启动
 */
function startServer(cb) {
    var startCb = function () {
        console.log("server start: " + app.host + ":" + app.port + " / " + app.serverId);
        cb && cb();
    };
    var newClientCb = function (socket) {
        new backend_socket(socket);
    };
    tcpServer_1.default(app.port, startCb, newClientCb);
}
var backend_socket = /** @class */ (function () {
    function backend_socket(socket) {
        this.heartBeatTimer = null;
        this.registerTimer = null;
        this.registered = false;
        this.sid = "";
        this.socket = socket;
        socket.on('data', this.onData.bind(this));
        socket.on('close', this.onClose.bind(this));
        this.registerTimer = setTimeout(function () {
            app.logger(interfaceDefine_1.loggerType.warn, interfaceDefine_1.componentName.backendServer, "register time out");
            socket.close();
        }, 10000);
        this.heartBeat_handle();
    }
    /**
     * socket收到数据了
     * @param data
     */
    backend_socket.prototype.onData = function (data) {
        var type = data.readUInt8(0);
        if (type === 3 /* msg */) {
            try {
                this.msg_handle(data);
            }
            catch (e) {
                app.logger(interfaceDefine_1.loggerType.error, interfaceDefine_1.componentName.backendServer, e);
            }
        }
        else if (type === 1 /* register */) {
            this.register_handle(data);
        }
        else if (type === 2 /* heartbeat */) {
            this.heartBeat_handle();
            this.heartbeat_response();
        }
        else {
            app.logger(interfaceDefine_1.loggerType.warn, interfaceDefine_1.componentName.backendServer, "illegal data : " + this.sid);
            this.socket.close();
        }
    };
    /**
     * socket连接关闭了
     */
    backend_socket.prototype.onClose = function () {
        clearTimeout(this.registerTimer);
        clearTimeout(this.heartBeatTimer);
        if (this.registered) {
            remoteBackend.removeClient(this.sid);
        }
    };
    /**
     * 前端服务器注册
     */
    backend_socket.prototype.register_handle = function (_data) {
        var data;
        try {
            data = JSON.parse(_data.slice(1).toString());
        }
        catch (err) {
            this.socket.close();
            return;
        }
        if (data.serverToken !== app.serverToken) {
            app.logger(interfaceDefine_1.loggerType.warn, interfaceDefine_1.componentName.backendServer, "illegal register token");
            this.socket.close();
            return;
        }
        this.registered = true;
        this.sid = data.sid;
        clearTimeout(this.registerTimer);
        remoteBackend.addClient(this.sid, this.socket);
    };
    /**
     * 心跳
     */
    backend_socket.prototype.heartBeat_handle = function () {
        var self = this;
        clearTimeout(this.heartBeatTimer);
        this.heartBeatTimer = setTimeout(function () {
            app.logger(interfaceDefine_1.loggerType.warn, interfaceDefine_1.componentName.backendServer, "heartbeat time out : " + self.sid);
            self.socket.close();
        }, define.some_config.Time.Remote_Heart_Beat_Time * 1000 * 2);
    };
    /**
     * 心跳回应
     */
    backend_socket.prototype.heartbeat_response = function () {
        var buf = Buffer.allocUnsafe(5);
        buf.writeUInt32BE(1, 0);
        buf.writeUInt8(3 /* heartbeatResponse */, 4);
        this.socket.send(buf);
    };
    /**
     * 收到前端服务器消息
     * @param msgBuf
     */
    backend_socket.prototype.msg_handle = function (msgBuf) {
        var sessionLen = msgBuf.readUInt16BE(1);
        var sessionBuf = msgBuf.slice(3, 3 + sessionLen);
        var session = new session_1.Session();
        session.setAll(JSON.parse(sessionBuf.toString()));
        var cmdId = msgBuf.readUInt8(3 + sessionLen);
        var cmd = routeConfig[cmdId];
        var cmdArr = cmd.split('.');
        var msg;
        if (decode) {
            msg = decode(cmdId, msgBuf.slice(4 + sessionLen), session);
        }
        else {
            msg = JSON.parse(msgBuf.slice(4 + sessionLen).toString());
        }
        msgHandler[cmdArr[1]][cmdArr[2]](msg, session, this.callback(cmdId, session.uid));
    };
    /**
     * 回调
     * @param cmdId
     * @param uid
     */
    backend_socket.prototype.callback = function (cmdId, uid) {
        var self = this;
        return function (msg) {
            if (msg === undefined) {
                msg = null;
            }
            var msgBuf = msgCoder_1.encodeRemoteData_1(cmdId, msg);
            var buf = msgCoder_1.encodeRemoteData_2([uid], cmdId, msgBuf);
            self.socket.send(buf);
        };
    };
    return backend_socket;
}());
