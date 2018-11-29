import { Application } from "mydog";
import room from "./room";

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
        let result = {} as any;
        let tmpRoom;
        for (let id in this.rooms) {
            tmpRoom = this.rooms[id];
            result[id] = {
                "id": id,
                "name": tmpRoom.name,
                "password": tmpRoom.password
            }
        }
        return result;
    }
    newRoom(msg: any) {
        let tmpRoom = new room(this.app);
        tmpRoom.init(this.id++, msg);
        this.rooms[tmpRoom.id] = tmpRoom;

        let info = tmpRoom.addUser(msg);
        info.serverId = this.app.serverId;
        info.serverName = this.serverName;
        return info;
    };

    joinRoom(msg: any): any {
        let tmpRoom = this.rooms[msg.roomId];
        if (!tmpRoom) {
            return { "status": -3 };
        }
        let info = tmpRoom.addUser(msg);
        info.serverId = this.app.serverId;
        info.serverName = this.serverName;
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