import { Application, RpcClass, rpcErr } from "mydog";
import roomMgr from "../../../domain/roomMgr";

export default function (app: Application) {
    return new remote(app);
}

declare global {
    interface Rpc {
        chat: {
            chatRemote: RpcClass<remote>
        }
    }
}

class remote {
    private app: Application;
    private roomMgr: roomMgr;
    constructor(app: Application) {
        this.app = app;
        this.roomMgr = app.get("roomMgr");
    }

    getRooms(cb: (err: rpcErr, data: any) => void) {
        cb(null as any, this.roomMgr.getRooms());
    };

    newRoom(msg: any, cb: Function) {
        let info = this.roomMgr.newRoom(msg);
        cb(null, info);
    };

    joinRoom(msg: any, cb: Function) {
        let info = this.roomMgr.joinRoom(msg);
        cb(null, info);
    };

    leaveRoom(msg: any) {
        this.roomMgr.leaveRoom(msg.roomId, msg.playerId);
    };

    test(str1: string, str2: string, cb: (err: rpcErr, num: number, str: string) => void) {
        console.log("收到", str1, str2);
        cb(null as any, 2222, "hahahah");
    }
}