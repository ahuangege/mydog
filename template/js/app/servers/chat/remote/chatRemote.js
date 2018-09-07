module.exports = function (app) {
    return new chatRemote(app);
};

var chatRemote = function (app) {
    this.app = app;
};

var pro = chatRemote.prototype;

pro.getRooms = function (cb) {
    var roomMgr = this.app.get("roomMgr");
    cb(roomMgr.getRooms());
};

pro.newRoom = function (msg, cb) {
    var roomMgr = this.app.get("roomMgr");
    var info = roomMgr.newRoom(msg);
    cb(info);
};

pro.joinRoom = function (msg, cb) {
    var roomMgr = this.app.get("roomMgr");
    var info = roomMgr.joinRoom(msg);
    cb(info);
};

pro.leaveRoom = function (msg) {
    var roomMgr = this.app.get("roomMgr");
    roomMgr.leaveRoom(msg.roomId, msg.playerId);
};

