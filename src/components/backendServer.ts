

import * as fs from "fs";
import * as path from "path";
import Application from "../application";
import * as define from "../util/define";
import { I_encodeDecodeConfig, loggerLevel } from "../util/interfaceDefine";
import { encodeRemoteData } from "./msgCoder";

import * as protocol from "../connector/protocol";
import { Session, initSessionApp } from "./session";


export class BackendServer {
    private app: Application;
    private msgHandler: { [filename: string]: any } = {};
    private sessionMap = new Map<number, Session>();
    private sessionFetchingMap = new Map<number, Promise<void>>();
    private sessionExpireMap = new Map<number, Set<number>>(); // 每5秒一个桶
    private expireTime = 0; // session 过期时间
    private needSession = true; // 是否需要同步前端session
    private expireSeconds = 0; // 过期时长
    private maxCacheCount = 0; // 最大缓存session个数

    constructor(app: Application) {
        this.app = app;
        initSessionApp(this.app);
        protocol.init(this.app);
        let defaultEncodeDecode: Required<I_encodeDecodeConfig> = protocol.default_encodeDecode;
        let encodeDecodeConfig = this.app.someconfig.encodeDecode || {};
        this.app.protoEncode = encodeDecodeConfig.protoEncode || defaultEncodeDecode.protoEncode;
        this.app.msgEncode = encodeDecodeConfig.msgEncode || defaultEncodeDecode.msgEncode;
        this.app.protoDecode = encodeDecodeConfig.protoDecode || defaultEncodeDecode.protoDecode;
        this.app.msgDecode = encodeDecodeConfig.msgDecode || defaultEncodeDecode.msgDecode;

        const sessionCfg = this.app.someconfig.session || {};
        if (sessionCfg.noNeedSyncServerTypes && sessionCfg.noNeedSyncServerTypes.includes(this.app.serverType)) {
            this.needSession = false;
        }

        this.expireSeconds = Math.max(sessionCfg.expireSeconds || 0, 15);
        this.maxCacheCount = Math.max(sessionCfg.maxCacheCount || 0, 3000);

        this.loadHandler();

        setInterval(() => {
            this.checkExpire();
        }, 1000)
        this.checkExpire();
    }

    /**
     * Back-end server load routing processing
     */
    private loadHandler() {
        let dirName = path.join(this.app.base, define.some_config.File_Dir.Servers, this.app.serverType, "handler");
        let exists = fs.existsSync(dirName);
        if (exists) {
            let self = this;
            fs.readdirSync(dirName).forEach(function (filename) {
                if (!filename.endsWith(".js")) {
                    return;
                }
                let name = path.basename(filename, '.js');
                let handler = require(path.join(dirName, filename));
                if (handler.default && typeof handler.default === "function") {
                    self.msgHandler[name] = new handler.default(self.app);
                }
            });
        }
    }

    /**
     * The back-end server receives the client message forwarded by the front-end server
     */
    async handleMsg(id: string, msg: Buffer) {
        const cmd = msg.readUInt16BE(1);
        const uid = msg.readUint32BE(3);
        const version = msg.readUint32BE(7);
        const data = this.app.msgDecode(cmd, msg.subarray(11));
        const cmdArr = this.app.routeConfig2[cmd];

        let session = this.getSession(uid);
        if (this.needSession) {
            if (!session || session.version !== version || session.sid !== id) {
                session = await this.fetchSession(uid, id);
            }
        } else {
            if (!session || session.sid !== id) {
                session = this.fetchNoNeedSession(uid, id);
            }
        }

        if (!session) {
            return;
        }

        this.updateSession(session);

        const ok = await this.app.filter.beforeFilter(cmd, data, session);
        if (!ok) {
            return;
        }
        const rsp = await this.msgHandler[cmdArr[1]][cmdArr[2]](data, session);
        if (rsp) {
            const socket = this.app.rpcPool.getSocket(id);
            if (socket) {
                let buf = this.app.protoEncode(cmd, rsp);
                let bufHead = encodeRemoteData([session.uid], buf.head.length + buf.msg.length);
                socket.send(bufHead, buf.head, buf.msg);
            }
        }
        this.app.filter.afterFilter(cmd, rsp, session);
    }



    /**
     * The back-end server sends a message to the client
     */
    sendMsgByUidSid(cmd: number, msg: any, uidsid: { "uid": number, "sid": string }[]) {
        if (uidsid.length === 0) {
            return;
        }
        const groups: { [sid: string]: number[] } = {};
        for (const one of uidsid) {
            if (!one.sid) {
                continue;
            }
            let group = groups[one.sid];
            if (!group) {
                group = [];
                groups[one.sid] = group;
            }
            group.push(one.uid);
        }
        let app = this.app;
        let msgBuf: { "head": Buffer, "msg": Buffer } = null as any;
        for (const sid in groups) {
            const socket = app.rpcPool.getSocket(sid);
            if (!socket) {
                continue;
            }
            if (!msgBuf) {
                msgBuf = app.protoEncode(cmd, msg);
            }
            const headBuf = encodeRemoteData(groups[sid], msgBuf.head.length + msgBuf.msg.length);
            socket.send(headBuf, msgBuf.head, msgBuf.msg);
        }
    }

    /**
     * The back-end server sends a message to the client
     */
    sendMsgByGroup(cmd: number, msg: any, group: { [sid: string]: number[] }) {
        let app = this.app;
        let msgBuf: { "head": Buffer, "msg": Buffer } = null as any;
        for (const sid in group) {
            if (!sid) {
                continue;
            }
            if (group[sid].length === 0) {
                continue;
            }
            const socket = app.rpcPool.getSocket(sid);
            if (!socket) {
                continue;
            }
            if (!msgBuf) {
                msgBuf = app.protoEncode(cmd, msg);
            }
            let headBuf = encodeRemoteData(group[sid], msgBuf.head.length + msgBuf.msg.length);
            socket.send(headBuf, msgBuf.head, msgBuf.msg);
        }
    }

    fetchNoNeedSession(uid: number, sid: string) {
        let session = this.getSession(uid);
        if (!session) {
            session = new Session(sid);
            session.uid = uid;
            this.addSession(session);
        } else {
            session.sid = sid;
        }
        return session;
    }

    async fetchSession(uid: number, sid: string): Promise<Session> {
        const fetching = this.sessionFetchingMap.get(uid);
        if (fetching) {
            await fetching;
            return this.getSession(uid);
        }

        const promise = this.loadSession(uid, sid);
        this.sessionFetchingMap.set(uid, promise);

        await promise;
        if (this.sessionFetchingMap.get(uid) === promise) {
            this.sessionFetchingMap.delete(uid);
        }
        return this.getSession(uid);
    }

    async loadSession(uid: number, sid: string) {
        const promise = new Promise<void>(async (resolve) => {
            let getOk = false;
            try {
                if (this.app.rpcPool.getSocket(sid)) {
                    const info = await this.app.sysRpc(sid).frontend.sessionRemote.getSession(uid);
                    if (info) {
                        getOk = true;
                        let session = this.getSession(uid);
                        if (session) {
                            session.sid = sid;
                            session.syncSettings(info);
                            this.updateSession(session);
                        } else {
                            session = new Session(sid);
                            session.uid = uid;
                            session.syncSettings(info);
                            this.addSession(session);
                        }
                    }
                }
            } catch (err: any) {
                this.app.logger(loggerLevel.error, err);
            } finally {
                if (!getOk) {
                    this.delSession(this.getSession(uid));
                }
                resolve(null);
            }
        });

        return promise;
    }

    getSession(uid: number) {
        return this.sessionMap.get(uid);
    }

    delSession(session: Session) {
        if (!session) {
            return;
        }
        this.sessionMap.delete(session.uid);
        const set = this.sessionExpireMap.get(session.expireTime);
        if (set) {
            set.delete(session.uid);
        }
    }

    addSession(session: Session) {
        session.expireTime = this.expireTime;
        this.sessionMap.set(session.uid, session);
        let set = this.sessionExpireMap.get(session.expireTime);
        if (!set) {
            set = new Set();
            this.sessionExpireMap.set(session.expireTime, set);
        }
        set.add(session.uid);

        this.checkCacheTooMuch();
    }

    updateSession(session: Session) {
        if (session.expireTime === this.expireTime) {
            return;
        }

        const oldSet = this.sessionExpireMap.get(session.expireTime);
        if (oldSet) {
            oldSet.delete(session.uid);
        }

        session.expireTime = this.expireTime;
        let set = this.sessionExpireMap.get(session.expireTime);
        if (!set) {
            set = new Set();
            this.sessionExpireMap.set(session.expireTime, set);
        }
        set.add(session.uid);
    }


    /** 检测过期 */
    checkExpire() {
        const nowSeconds = Math.floor(Date.now() / 1000)
        const expireTime = nowSeconds + this.expireSeconds;
        this.expireTime = Math.floor(expireTime / 5) * 5 + 5;


        for (const [time, set] of this.sessionExpireMap) {
            if (nowSeconds <= time) {
                break;
            }
            this.sessionExpireMap.delete(time);
            for (const uid of set) {
                this.sessionMap.delete(uid);
            }
        }
    }

    /** 检测缓存个数 */
    checkCacheTooMuch() {
        if (this.sessionMap.size < this.maxCacheCount + 200) {
            return;
        }

        let delCnt = 0;
        for (const [time, set] of this.sessionExpireMap) {
            for (const uid of set) {
                this.delSession(this.getSession(uid));
                delCnt++;
                if (delCnt >= 300) {
                    break;
                }
            }

            if (delCnt >= 300) {
                break;
            }
        }
        this.app.logger(loggerLevel.info, "backend sessionCacheDel:" + delCnt);
    }
}
