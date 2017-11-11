var nowFileName = "session.js";
var app = require("../mydog.js").app;
var session = function () {
    this.uid = "";
    this.sid = "";
    this.socket = null;
    this._onclosed = null;
    this.settings = {};
};

module.exports = session;

session.prototype.bind = function (_uid, cb) {
    if (!app.frontend) {
        return;
    }
    if (!cb) {
        cb = function () {
        };
    }
    if (app.clients[_uid]) {
        app.logger(nowFileName, "error", "- already has a session bind with: " + _uid);
        cb("already has a session bind with: " + _uid);
        return;
    }
    app.clients[_uid] = this;
    this.uid = _uid;
    cb(null);
};

session.prototype.set = function (setting, val) {
    this.settings[setting] = val;
};

session.prototype.get = function (setting) {
    return this.settings[setting];
};

session.prototype.delete = function (setting) {
    delete this.settings[setting];
};

session.prototype.getAll = function () {
    return {
        "uid": this.uid,
        "sid": this.sid,
        "settings": this.settings
    };
};

session.prototype.setAll = function (_session) {
    this.uid = _session.uid;
    this.sid = _session.sid;
    this.settings = _session.settings;
};

session.prototype.apply = function () {
    if (!app.frontend) {
        var tmpSession = this.getAll();
        app.remoteBackend.sendSession(this.sid, this.uid, tmpSession);
    }
};

session.prototype.onclosed = function (cb) {
    this._onclosed = cb;
};
