import { Application, RpcClass } from "mydog";
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
    app: Application;
    roomMgr: roomMgr;
    constructor(app: Application) {
        this.app = app;
        this.roomMgr = app.get("roomMgr");
    }

    getRooms(cb: Function) {
        cb(this.roomMgr.getRooms());
    };

    newRoom(msg: any, cb: Function) {
        let info = this.roomMgr.newRoom(msg);
        cb(info);
    };

    joinRoom(msg: any, cb: Function) {
        let info = this.roomMgr.joinRoom(msg);
        cb(info);
    };

    leaveRoom(msg: any) {
        this.roomMgr.leaveRoom(msg.roomId, msg.playerId);
    };
}