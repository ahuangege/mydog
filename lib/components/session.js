"use strict";
/**
 * session类。前端服务器中代表着客户端连接，后端服务器中是部分数据的拷贝
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Session = exports.initSessionApp = void 0;
let app;
function initSessionApp(_app) {
    app = _app;
}
exports.initSessionApp = initSessionApp;
class Session {
    constructor(sid = "") {
        this.uid = 0; // 绑定的uid，玩家唯一标识
        this.sid = ""; // 前端服务器id
        this.settings = {}; // 用户set,get
        this.sessionBuf = null; // buff
        this.socket = null; // 玩家的socket连接
        this.sid = sid;
        this.resetBuf();
    }
    resetBuf() {
        if (app.frontend) {
            let tmpBuf = Buffer.from(JSON.stringify({ "uid": this.uid, "sid": this.sid, "settings": this.settings }));
            this.sessionBuf = Buffer.alloc(tmpBuf.length).fill(tmpBuf); // 复制原因： Buffer.from可能从内部buffer池分配，而sessionBuf几乎常驻不变
        }
    }
    /**
     * 绑定session [注：前端调用]
     */
    bind(_uid) {
        if (!app.frontend || !this.socket) {
            return false;
        }
        if (app.clients[_uid]) {
            return false;
        }
        app.clients[_uid] = this.socket;
        this.uid = _uid;
        this.resetBuf();
        return true;
    }
    set(_settings) {
        for (let f in _settings) {
            this.settings[f] = _settings[f];
        }
        this.resetBuf();
    }
    get(key) {
        return this.settings[key];
    }
    delete(keys) {
        for (let one of keys) {
            delete this.settings[one];
        }
        this.resetBuf();
    }
    /**
     * 设置所有session
     */
    setAll(_session) {
        this.uid = _session.uid;
        this.sid = _session.sid;
        this.settings = _session.settings;
    }
    /**
     * 关闭连接 [注：前端调用]
     */
    close() {
        if (app.frontend && this.socket) {
            this.socket.close();
        }
    }
    /**
     * 将后端session推送到前端  [注：后端调用]
     */
    apply() {
        if (!app.frontend) {
            app.backendServer.sendSession(this.sid, Buffer.from(JSON.stringify({
                "uid": this.uid,
                "settings": this.settings
            })));
        }
    }
    /**
     * 后端调用apply后，前端接收到的处理
     */
    applySession(settings) {
        this.settings = settings;
        this.resetBuf();
    }
}
exports.Session = Session;
