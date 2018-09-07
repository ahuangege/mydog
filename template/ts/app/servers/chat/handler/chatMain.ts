import { Application, Session } from "mydog";
import roomMgr from "../../../domain/roomMgr";

export default class handler{
    app: Application;
    constructor(_app: Application){
        this.app = _app;
    }
    send (msg:any, session: Session, next: Function) {
        let room = (this.app.get("roomMgr") as roomMgr).getRoom(session.get("roomId"));
        if (room) {
            room.send(session.get("playerId"), msg);
        }
    };
    
    leaveRoom (msg: any, session: Session, next: Function) {
        (this.app.get("roomMgr") as roomMgr).leaveRoom(session.get("roomId"), session.get("playerId"));
        session.delete("chatServerId");
        session.delete("roomId");
        session.delete("playerId");
        session.apply();
    };
}