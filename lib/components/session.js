"use strict";
/**
 * session类。前端服务器中代表着客户端连接，后端服务器中是部分数据的拷贝
 */
Object.defineProperty(exports, "__esModule", { value: true });
var app;
function initSessionApp(_app) {
    app = _app;
}
exports.initSessionApp = initSessionApp;
var Session = /** @class */ (function () {
    function Session(sid) {
        if (sid === void 0) { sid = ""; }
        this.uid = 0; // 绑定的uid，玩家唯一标识
        this.sid = ""; // 前端服务器id
        this.settings = {}; // 用户set,get
        this.sessionBuf = null; // buff
        this.socket = null; // 玩家的socket连接
        this._onclosed = null; // socket断开回调
        this.sid = sid;
        this.resetBuf();
    }
    Session.prototype.resetBuf = function () {
        if (app.frontend) {
            this.sessionBuf = Buffer.from(JSON.stringify({
                "uid": this.uid,
                "sid": this.sid,
                "settings": this.settings
            }));
        }
    };
    /**
     * 绑定session     》前端专用
     * @param _uid 用户唯一标识
     */
    Session.prototype.bind = function (_uid) {
        if (!app.frontend) {
            return false;
        }
        if (app.clients[_uid]) {
            return false;
        }
        app.clients[_uid] = this.socket;
        this.uid = _uid;
        this.resetBuf();
        return true;
    };
    Session.prototype.set = function (key, value) {
        this.settings[key] = value;
        this.resetBuf();
        return value;
    };
    Session.prototype.setSome = function (_settings) {
        for (var f in _settings) {
            this.settings[f] = _settings[f];
        }
        this.resetBuf();
    };
    Session.prototype.get = function (key) {
        return this.settings[key];
    };
    Session.prototype.delete = function (key) {
        delete this.settings[key];
        this.resetBuf();
    };
    /**
     * 设置所有session
     */
    Session.prototype.setAll = function (_session) {
        this.uid = _session.uid;
        this.sid = _session.sid;
        this.settings = _session.settings;
        this.resetBuf();
    };
    /**
     * 关闭连接      》前端专用
     */
    Session.prototype.close = function () {
        if (!app.frontend) {
            return;
        }
        this.socket.close();
    };
    /**
     * 将后端session推送到前端    》后端调用
     */
    Session.prototype.apply = function () {
        if (!app.frontend) {
            app.backendServer.sendSession(this.sid, this.sessionBuf);
        }
    };
    /**
     * 客户端断开连接的回调      》前端调用
     */
    Session.prototype.setCloseCb = function (cb) {
        this._onclosed = cb;
    };
    return Session;
}());
exports.Session = Session;
