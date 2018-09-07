var room = require("./room.js");

module.exports = function (app) {
    return new roomMgr(app);
};

var roomMgr = function (app) {
    this.app = app;
    this.id = 1;
    this.rooms = {};
    this.userNum = 0;

    var servers = this.app.getServersByType(this.app.serverType);
    for (var i = 0; i < servers.length; i++) {
        if (servers[i].id === this.app.serverId) {
            this.serverName = servers[i].name;
            break;
        }
    }
};

var pro = roomMgr.prototype;

pro.getRooms = function () {
    var result = {};
    var tmpRoom;
    for (var id in this.rooms) {
        tmpRoom = this.rooms[id];
        result[id] = {
            "id": id,
            "name": tmpRoom.name,
            "password": tmpRoom.password
        }
    }
    return result;
};

pro.newRoom = function (msg) {
    var tmpRoom = new room(this.app);
    tmpRoom.init(this.id++, msg);
    this.rooms[tmpRoom.id] = tmpRoom;

    var info = tmpRoom.addUser(msg);
    info.serverId = this.app.serverId;
    info.serverName = this.serverName;
    return info;
};

pro.joinRoom = function (msg) {
    var tmpRoom = this.rooms[msg.roomId];
    if (!tmpRoom) {
        return {"status": -3};
    }
    var info = tmpRoom.addUser(msg);
    info.serverId = this.app.serverId;
    info.serverName = this.serverName;
    return info;
};

pro.destroyRoom = function (roomId) {
    delete this.rooms[roomId];
};

pro.getRoom = function (roomId) {
    return this.rooms[roomId];
};

pro.leaveRoom = function (roomId, playerId) {
    var tmpRoom = this.rooms[roomId];
    if (tmpRoom) {
        tmpRoom.leaveRoom(playerId);
    }
};
