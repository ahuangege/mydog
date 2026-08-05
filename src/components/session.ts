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
    sid: string = "";                                       // Front-end server id
    version = 1;

    private settings: { [key: string]: any } = {};          // user set,get
    private settingsLocal: { [key: string]: any } = {};     // user set,get（Local, will not sync to backend）

    socket: I_clientSocket = null as any;                   // Player's socket connection

    constructor(sid: string = "") {
        this.sid = sid;
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
        return true;
    }

    set(_settings: { [key: string]: any }) {
        for (let f in _settings) {
            this.settings[f] = _settings[f];
        }
        this.addVersion();
    }

    get(key: string | number) {
        return this.settings[key];
    }

    delete(keys: (string | number)[]) {
        for (let one of keys) {
            delete this.settings[one];
        }
        this.addVersion();
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
     * Get ip
     */
    getIp() {
        if (this.socket) {
            return this.socket.remoteAddress;
        } else {
            return "";
        }
    }

    /** Send msg to client */
    send(cmd: number, msg: any) {
        if (!app.frontend || !this.socket) {
            return;
        }
        if (msg === undefined) {
            msg = null;
        }
        let msgBuf = app.protoEncode(cmd, msg);
        this.socket.send(msgBuf);
    }

    addVersion() {
        this.version++;
        if (this.version > 4000000000) {
            this.version = 1;
        }
    }

    getSettings() {
        return { "version": this.version, "settings": this.settings }
    }

    syncSettings(info: { version: number, settings: { [key: string]: any } }) {
        this.version = info.version;
        this.settings = info.settings;
    }
}