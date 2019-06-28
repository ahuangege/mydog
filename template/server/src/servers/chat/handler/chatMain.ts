import { Application, Session } from "mydog";
import roomMgr from "../../../app/roomMgr";
import Proto = require("../../../app/Proto");

export default class handler {
    app: Application;
    constructor(_app: Application) {
        this.app = _app;
    }
    send(msg: Proto.chat_send_req, session: Session, next: Function) {
        let room = this.app.get<roomMgr>("roomMgr").getRoom(session.get("roomId"));
        if (room) {
            room.send(session.get("playerId"), msg);
        }
    };

    leaveRoom(msg: any, session: Session, next: Function) {
        this.app.get<roomMgr>("roomMgr").leaveRoom(session.get("roomId"), session.get("playerId"));
        session.delete("chatServerId");
        session.delete("roomId");
        session.delete("playerId");
        session.apply();
    }
}