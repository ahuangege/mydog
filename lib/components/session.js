var app = require("../mydog.js").app;
var session = function () {
    this.uid = "";          // 绑定的uid
    this.sid = "";          // 前端服务器id
    this.socket = null;     // 玩家的socket连接
    this._onclosed = null;              // socket断开回调
    this.registered = false;            // 客户端是否注册
    this.heartbeat_timer = null;        // 心跳计时
    this.settings = {};                 // session
};

module.exports = session;

/**
 * 绑定session     》前端专用
 * @param _uid
 */
session.prototype.bind = function (_uid) {
    if (!app.frontend) {
        return false;
    }
    if (app.clients[_uid]) {
        return false;
    }
    app.clients[_uid] = this;
    this.uid = _uid;
    return true;
};

session.prototype.set = function (key, value) {
    this.settings[key] = value;
};

session.prototype.get = function (key) {
    return this.settings[key];
};

session.prototype.delete = function (key) {
    delete this.settings[key];
};

/**
 * 获取所有session  》用户不要调用
 * @returns {{uid: *, sid: *, settings: *}}
 */
session.prototype.getAll = function () {
    return {
        "uid": this.uid,
        "sid": this.sid,
        "settings": this.settings
    };
};

/**
 * 设置所有session    》用户不要调用
 * @param _session
 */
session.prototype.setAll = function (_session) {
    this.uid = _session.uid;
    this.sid = _session.sid;
    this.settings = _session.settings;
};

/**
 * 设置部分setting
 * @param _settings
 */
session.prototype.setSome = function (_settings) {
    for (var f in _settings) {
        this.settings[f] = _settings[f];
    }
};

/**
 * 将后端session推送到前端    》后端调用
 */
session.prototype.apply = function () {
    if (!app.frontend) {
        var tmpSession = this.getAll();
        app.remoteBackend.sendSession(tmpSession);
    }
};


/**
 * 客户端断开连接的回调      》前端调用
 * @param cb
 */
session.prototype.setCloseCb = function (cb) {
    this._onclosed = cb;
};
