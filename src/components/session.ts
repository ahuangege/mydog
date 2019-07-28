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
    settings: { [key: string]: any } = {};          // 用户set,get

    socket: I_clientSocket = null as any;              // 玩家的socket连接
    _onclosed: (app: Application, session: Session) => void = null as any;              // socket断开回调

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
        return true;
    }


    set(key: string | number, value: any) {
        this.settings[key] = value;
        return value;
    }

    get(key: string | number) {
        return this.settings[key];
    }

    delete(key: string | number) {
        delete this.settings[key];
    }

    /**
     * 获取所有session  》用户不要调用
     */
    getAll(): sessionApplyJson {
        return {
            "uid": this.uid,
            "sid": this.sid,
            "settings": this.settings
        };
    }

    /**
     * 设置所有session    》用户不要调用
     */
    setAll(_session: sessionApplyJson) {
        this.uid = _session.uid;
        this.sid = _session.sid;
        this.settings = _session.settings;
    }

    /**
     * 设置部分setting  》用户不要调用
     */
    setSome(_settings: any) {
        for (let f in _settings) {
            this.settings[f] = _settings[f];
        }
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
            let tmpSession = this.getAll();
            app.backendServer.sendSession(tmpSession);
        }
    }


    /**
     * 客户端断开连接的回调      》前端调用
     */
    setCloseCb(cb: (app: Application, session: Session) => void) {
        this._onclosed = cb;
    }

}