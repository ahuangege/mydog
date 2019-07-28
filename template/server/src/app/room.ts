import { Application } from "mydog";
import roomMgr from "./roomMgr";
import Proto = require("./Proto");

export default class room {
    app: Application;
    roomMgr: roomMgr;
    id: number = 1;
    name: string = "";
    password: string = "";
    players: { [id: string]: Proto.player_info } = {};
    playerId: number = 1;
    userNum: number = 0;
    playerIds: number[] = [];
    uidsid: { "uid": number, "sid": string }[] = [];
    constructor(_app: Application) {
        this.app = _app;
        this.roomMgr = _app.get("roomMgr") as roomMgr;
    }

    init(_id: number, msg: Proto.connector_main_newRoom_req) {
        this.id = _id;
        this.name = msg.roomName;
        this.password = msg.password;
    }
    addUser(msg: Proto.connector_main_newRoom_req): Proto.join_room_rsp {
        if (this.password !== "" && this.password !== msg.password) {
            return { "status": -1 } as any;
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
        this.uidsid.push({ "uid": player.uid, "sid": player.sid });

        let player_arr: Proto.player_info[] = [];
        for (let x in this.players) {
            player_arr.push(this.players[x]);
        }

        return {
            "status": 0,
            "roomName": this.name,
            "roomId": this.id,
            "playerId": player.id,
            "serverId": this.app.serverId,
            "serverName": this.roomMgr.serverName,
            "players": player_arr
        };
    }

    send(playerId: number, msg: Proto.chat_send_req) {
        let back_msg: Proto.onChat_info = msg as any;
        let player = this.players[playerId];
        if (player) {
            if (msg.type === 1) {
                back_msg.from = player.name;
                back_msg.fromId = player.id;
                this.broadcastMsg("onChat", back_msg);
            } else {
                let toPlayer = this.players[msg.toId];
                if (toPlayer) {
                    back_msg.to = toPlayer.name;
                    back_msg.toId = toPlayer.id;
                    back_msg.from = player.name;
                    back_msg.fromId = player.id;
                    let uidsid: { "uid": number, "sid": string }[] = [];
                    uidsid.push({ "uid": player.uid, "sid": player.sid });
                    if (player.id !== toPlayer.id) {
                        uidsid.push({ "uid": toPlayer.uid, "sid": toPlayer.sid });
                    }
                    this.app.sendMsgByUidSid("onChat", back_msg, uidsid);
                }
            }
        }
    }

    leaveRoom(playerId: number) {
        let player = this.players[playerId];
        if (player) {
            let index = this.playerIds.indexOf(playerId);
            this.playerIds.splice(index, 1);
            this.uidsid.splice(index, 1);
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
        this.app.sendMsgByUidSid(route, msg, this.uidsid);
    };
}