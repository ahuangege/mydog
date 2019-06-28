import { Application } from "mydog";
import room from "./room";
import Proto = require("./Proto");

export default class roomMgr {
    app: Application
    id: number = 1;
    rooms: { [roomId: number]: room } = {};
    userNum: number = 0;
    serverName: string = "";
    constructor(_app: Application) {
        this.app = _app;
        this.serverName = _app.serverInfo.name;
    }

    getRooms() {
        let result: Proto.connector_main_getChatInfo_room_info[] = [];
        for (let id in this.rooms) {
            let tmpRoom = this.rooms[id];
            result.push({
                "id": tmpRoom.id,
                "name": tmpRoom.name,
                "password": tmpRoom.password
            });
        }
        return { "rooms": result };
    }
    newRoom(msg: Proto.connector_main_newRoom_req): Proto.join_room_rsp {
        let tmpRoom = new room(this.app);
        tmpRoom.init(this.id++, msg);
        this.rooms[tmpRoom.id] = tmpRoom;

        let info = tmpRoom.addUser(msg);
        return info;
    };

    joinRoom(msg: Proto.connector_main_newRoom_req): Proto.join_room_rsp {
        let tmpRoom = this.rooms[msg.roomId];
        if (!tmpRoom) {
            return { "status": -3 } as any;
        }
        let info = tmpRoom.addUser(msg);
        return info;
    };

    destroyRoom(roomId: number) {
        delete this.rooms[roomId];
    }

    getRoom(roomId: number) {
        return this.rooms[roomId];
    }

    leaveRoom(roomId: number, playerId: number) {
        let tmpRoom = this.rooms[roomId];
        if (tmpRoom) {
            tmpRoom.leaveRoom(playerId);
        }
    }
}