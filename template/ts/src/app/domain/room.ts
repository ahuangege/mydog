import { Application } from "mydog";
import roomMgr from "./roomMgr";

export default class room {
    app: Application;
    roomMgr: roomMgr;
    id: number = 1;
    name: string = "";
    password: string = "";
    players: any = {};
    playerId: number = 1;
    userNum: number = 0;
    playerIds: number[] = [];
    uids: number[] = [];
    sids: string[] = [];
    constructor(_app: Application) {
        this.app = _app;
        this.roomMgr = _app.get("roomMgr") as roomMgr;
    }

    init(_id: number, msg: any) {
        this.id = _id;
        this.name = msg.roomName;
        this.password = msg.password;
    }
    addUser(msg: any): any {
        if (this.password !== "" && this.password !== msg.password) {
            return { "status": -1 };
        }

        let player = {
            "id": this.playerId,
            "uid": msg.uid,
            "sid": msg.sid,
            "name": msg.myName
        };
        this.broadcastMsg("onNewPlayer", player);

        this.players[player.id] = player;
        this.playerId++;
        this.roomMgr.userNum++;
        this.userNum++;
        this.playerIds.push(player.id);
        this.uids.push(player.uid);
        this.sids.push(player.sid);

        return {
            "status": 0,
            "roomName": this.name,
            "roomId": this.id,
            "playerId": player.id,
            "players": this.players
        };
    }

    send(playerId: number, msg: any) {
        let player = this.players[playerId];
        if (player) {
            if (msg.type === 1) {
                msg.from = player.name;
                msg.fromId = player.id;
                this.broadcastMsg("onChat", msg);
            } else {
                let toPlayer = this.players[msg.to];
                if (toPlayer) {
                    msg.to = toPlayer.name;
                    msg.toId = toPlayer.id;
                    msg.from = player.name;
                    msg.fromId = player.id;
                    let uids = [player.uid];
                    let sids = [player.sid];
                    if (player.id !== toPlayer.id) {
                        uids.push(toPlayer.uid);
                        sids.push(toPlayer.sid);
                    }
                    this.app.sendMsgByUidSid("onChat", msg, uids, sids);
                }
            }
        }
    }

    leaveRoom(playerId: number) {
        let player = this.players[playerId];
        if (player) {
            let index = this.playerIds.indexOf(playerId);
            this.playerIds.splice(index, 1);
            this.uids.splice(index, 1);
            this.sids.splice(index, 1);
            delete this.players[playerId];
            this.roomMgr.userNum--;
            this.userNum--;
            this.broadcastMsg("onLeave", { "id": playerId });
            if (this.userNum === 0) {
                this.roomMgr.destroyRoom(this.id);
            }
        }
    }

    broadcastMsg(route: string, msg: any) {
        this.app.sendMsgByUidSid(route, msg, this.uids, this.sids);
    };
}