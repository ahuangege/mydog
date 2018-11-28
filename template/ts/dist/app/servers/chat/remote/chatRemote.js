"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function default_1(app) {
    return new remote(app);
}
exports.default = default_1;
var remote = /** @class */ (function () {
    function remote(app) {
        this.app = app;
        this.roomMgr = app.get("roomMgr");
    }
    remote.prototype.getRooms = function (cb) {
        cb(this.roomMgr.getRooms());
    };
    ;
    remote.prototype.newRoom = function (msg, cb) {
        var info = this.roomMgr.newRoom(msg);
        cb(info);
    };
    ;
    remote.prototype.joinRoom = function (msg, cb) {
        var info = this.roomMgr.joinRoom(msg);
        cb(info);
    };
    ;
    remote.prototype.leaveRoom = function (msg) {
        this.roomMgr.leaveRoom(msg.roomId, msg.playerId);
    };
    ;
    return remote;
}());
