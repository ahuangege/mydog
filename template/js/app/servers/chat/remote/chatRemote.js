module.exports = function (app) {
    return new remote(app);
}
function remote(app) {
    this.app = app;
    this.roomMgr = app.get("roomMgr");
}
remote.prototype.getRooms = function (cb) {
    cb(null, this.roomMgr.getRooms());
};
;
remote.prototype.newRoom = function (msg, cb) {
    var info = this.roomMgr.newRoom(msg);
    cb(null, info);
};
;
remote.prototype.joinRoom = function (msg, cb) {
    var info = this.roomMgr.joinRoom(msg);
    cb(null, info);
};
;
remote.prototype.leaveRoom = function (msg) {
    this.roomMgr.leaveRoom(msg.roomId, msg.playerId);
};
