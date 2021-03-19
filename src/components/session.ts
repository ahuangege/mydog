/**
 * session class. The front-end server represents the client connection, and the back-end server is a copy of some data
 */


import Application from "../application";
import { I_clientSocket, sessionCopyJson } from "../util/interfaceDefine";

let app: Application;

export function initSessionApp(_app: Application) {
    app = _app;
}

export class Session {
    uid: number = 0;                                        // The bound uid, the unique identifier of the player
    private sid: string = "";                               // Front-end server id
    private settings: { [key: string]: any } = {};          // user set,get
    private settingsLocal: { [key: string]: any } = {};     // user set,get（Local, will not exist in buf）
    sessionBuf: Buffer = null as any;                       // buff

    socket: I_clientSocket = null as any;                   // Player's socket connection

    constructor(sid: string = "") {
        this.sid = sid;
        this.resetBuf();
    }

    private resetBuf() {
        if (app.frontend) {
            let tmpBuf = Buffer.from(JSON.stringify({ "uid": this.uid, "sid": this.sid, "settings": this.settings }));
            this.sessionBuf = Buffer.alloc(tmpBuf.length).fill(tmpBuf); // Copy reason: Buffer.from may be allocated from the internal buffer pool, while sessionBuf is almost resident
        }
    }

    /**
     * Binding session [Note: Front-end call]
     */
    bind(_uid: number): boolean {
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

    set(_settings: { [key: string]: any }) {
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


    setLocal(key: number | string, value: any) {
        this.settingsLocal[key] = value;
    }


    getLocal(key: number | string) {
        return this.settingsLocal[key];
    }


    deleteLocal(key: number | string) {
        delete this.settingsLocal[key];
    }

    /**
     * Set up all sessions 
     */
    setAll(_session: sessionCopyJson) {
        this.uid = _session.uid;
        this.sid = _session.sid;
        this.settings = _session.settings;
    }


    /**
     * Close the connection [Note: Front-end call]
     */
    close() {
        if (app.frontend && this.socket) {
            this.socket.close();
        }
    }

    /**
     * Push the back-end session to the front-end [Note: back-end call]
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
     * After the back-end calls apply, the processing received by the front-end
     */
    applySession(settings: { [key: string]: any }) {
        this.settings = settings;
        this.resetBuf();
    }

    /**
     * Get ip
     */
    getIp() {
        if (this.socket) {
            return this.socket.remoteAddress;
        } else {
            return "";
        }
    }
}