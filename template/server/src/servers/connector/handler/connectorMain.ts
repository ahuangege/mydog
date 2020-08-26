import { Application, Session, rpcErr } from "mydog";
import Proto = require("../../../app/Proto");

let uid = 1;

export default class Handler {
    app: Application;
    constructor(app: Application) {
        this.app = app;
    }
    getChatInfo(msg: { "id": string }, session: Session, next: (rooms: Proto.connector_main_getChatInfo_rsp) => void) {
        if (!session.uid) {
            session.bind(uid++);
            session.setCloseCb(onUserLeave);
        }
        this.app.rpc(msg.id).chat.chatRemote.getRooms(function (err: rpcErr, data) {
            if (err) {
                next({ "rooms": [] });
                return;
            }
            next(data);
        });
    };

    newRoom(msg: Proto.connector_main_newRoom_req, session: Session, next: (info: Proto.join_room_rsp) => void) {
        msg.uid = session.uid;
        msg.sid = session.sid;
        var self = this;
        self.app.rpc(msg.id).chat.chatRemote.newRoom(msg, function (err: rpcErr, data: Proto.join_room_rsp) {
            if (err) {
                next({ "status": -2 } as any);
                return;
            }
            if (data.status === 0) {
                session.setSome({
                    "chatServerId": data.serverId,
                    "roomId": data.roomId,
                    "playerId": data.playerId,
                });
            }
            next(data);
        });
    };

    joinRoom(msg: Proto.connector_main_newRoom_req, session: Session, next: (info: Proto.join_room_rsp) => void) {
        msg.uid = session.uid;
        msg.sid = session.sid;
        var self = this;
        self.app.rpc(msg.id).chat.chatRemote.joinRoom(msg, function (err, data) {
            if (err) {
                next({ "status": -2 } as any);
                return;
            }
            if (data.status === 0) {
                session.setSome({
                    "chatServerId": data.serverId,
                    "roomId": data.roomId,
                    "playerId": data.playerId,
                });
            }
            next(data);
        });
    };
}

var onUserLeave = function (app: Application, session: Session) {
    console.log("one client out");
    if (session.get("chatServerId")) {
        app.rpc(session.get("chatServerId")).chat.chatRemote.leaveRoom({
            "roomId": session.get("roomId"),
            "playerId": session.get("playerId")
        });
    }
};