
function handler(_app) {
    this.app = _app;
}
module.exports = handler;
handler.prototype.send = function (msg, session, next) {
    var room = this.app.get("roomMgr").getRoom(session.get("roomId"));
    if (room) {
        room.send(session.get("playerId"), msg);
    }
};
;
handler.prototype.leaveRoom = function (msg, session, next) {
    this.app.get("roomMgr").leaveRoom(session.get("roomId"), session.get("playerId"));
    session.delete("chatServerId");
    session.delete("roomId");
    session.delete("playerId");
    session.apply();
};