/**
 * session类。前端服务器中代表着客户端连接，后端服务器中是部分数据的拷贝
 */


import Application from "../application";
import * as backendServer from "./backendServer";
import { sessionApplyJson, I_clientSocket } from "../util/interfaceDefine";

let app: Application;

export function initSessionApp(_app: Application) {
    app = _app;
}

export class Session {
    uid: number = 0;                                // 绑定的uid，玩家唯一标识
    sid: string = "";                               // 前端服务器id
    private settings: { [key: string]: any } = {};          // 用户set,get
    sessionBuf: Buffer = null as any;  // buff

    socket: I_clientSocket = null as any;              // 玩家的socket连接
    _onclosed: (app: Application, session: Session) => void = null as any;              // socket断开回调


    constructor(sid: string = "") {
        this.sid = sid;
        this.resetBuf();
    }

    private resetBuf() {
        if (app.frontend) {
            let tmpBuf = Buffer.from(JSON.stringify({ "uid": this.uid, "sid": this.sid, "settings": this.settings }));
            this.sessionBuf = Buffer.alloc(tmpBuf.length).fill(tmpBuf); // 复制原因： Buffer.from可能从内部buffer池分配
        }
    }

    /**
     * 绑定session     》前端专用
     * @param _uid 用户唯一标识
     */
    bind(_uid: number): boolean {
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
    }

    setSome(_settings: { [key: string]: any }) {
        for (let f in _settings) {
            this.settings[f] = _settings[f];
        }
        this.resetBuf();
    }


    get(key: string | number) {
        return this.settings[key];
    }

    delete(keys: (string | number)[]) {
        for (let one of keys) {
            delete this.settings[one];
        }
        this.resetBuf();
    }

    /**
     * 设置所有session 
     */
    setAll(_session: sessionApplyJson) {
        this.uid = _session.uid;
        this.sid = _session.sid;
        this.settings = _session.settings;
        this.resetBuf();
    }


    /**
     * 关闭连接      》前端专用
     */
    close() {
        if (!app.frontend) {
            return;
        }
        this.socket.close();
    }

    /**
     * 将后端session推送到前端    》后端调用
     */
    apply() {
        if (!app.frontend) {
            app.backendServer.sendSession(this.sid, Buffer.from(JSON.stringify({
                "uid": this.uid,
                "sid": this.sid,
                "settings": this.settings
            })));
        }
    }


    /**
     * 客户端断开连接的回调      》前端调用
     */
    setCloseCb(cb: (app: Application, session: Session) => void) {
        this._onclosed = cb;
    }

}