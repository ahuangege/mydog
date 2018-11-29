var room = require("./room");

function roomMgr(_app) {
    this.id = 1;
    this.rooms = {};
    this.userNum = 0;
    this.serverName = "";
    this.app = _app;
    this.serverName = _app.serverInfo.name;
}

module.exports = roomMgr;

roomMgr.prototype.getRooms = function () {
    var result = {};
    var tmpRoom;
    for (var id in this.rooms) {
        tmpRoom = this.rooms[id];
        result[id] = {
            "id": id,
            "name": tmpRoom.name,
            "password": tmpRoom.password
        };
    }
    return result;
};
roomMgr.prototype.newRoom = function (msg) {
    var tmpRoom = new room(this.app);
    tmpRoom.init(this.id++, msg);
    this.rooms[tmpRoom.id] = tmpRoom;
    var info = tmpRoom.addUser(msg);
    info.serverId = this.app.serverId;
    info.serverName = this.serverName;
    return info;
};
;
roomMgr.prototype.joinRoom = function (msg) {
    var tmpRoom = this.rooms[msg.roomId];
    if (!tmpRoom) {
        return { "status": -3 };
    }
    var info = tmpRoom.addUser(msg);
    info.serverId = this.app.serverId;
    info.serverName = this.serverName;
    return info;
};
;
roomMgr.prototype.destroyRoom = function (roomId) {
    delete this.rooms[roomId];
};
roomMgr.prototype.getRoom = function (roomId) {
    return this.rooms[roomId];
};
roomMgr.prototype.leaveRoom = function (roomId, playerId) {
    var tmpRoom = this.rooms[roomId];
    if (tmpRoom) {
        tmpRoom.leaveRoom(playerId);
    }
};