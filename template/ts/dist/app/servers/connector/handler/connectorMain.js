"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function default_1(app) {
    return new Handler(app);
}
exports.default = default_1;
var uid = 1;
var Handler = /** @class */ (function () {
    function Handler(app) {
        this.app = app;
    }
    Handler.prototype.getChatInfo = function (msg, session, next) {
        if (!session.uid) {
            session.bind(uid++);
            session.setCloseCb(onUserLeave);
        }
        this.app.rpc.toServer(msg.id).chat.chatRemote.getRooms(function (err, data) {
            if (err) {
                next({});
                return;
            }
            next(data);
        });
    };
    ;
    Handler.prototype.newRoom = function (msg, session, next) {
        msg.uid = session.uid;
        msg.sid = session.sid;
        var self = this;
        self.app.rpc.toServer(msg.id).chat.chatRemote.newRoom(msg, function (err, data) {
            if (err) {
                next({ "status": -2 });
                return;
            }
            if (data.status === 0) {
                session.set("chatServerId", data.serverId);
                session.set("roomId", data.roomId);
                session.set("playerId", data.playerId);
            }
            next(data);
        });
    };
    ;
    Handler.prototype.joinRoom = function (msg, session, next) {
        msg.uid = session.uid;
        msg.sid = session.sid;
        var self = this;
        self.app.rpc.toServer(msg.id).chat.chatRemote.joinRoom(msg, function (err, data) {
            if (err) {
                next({ "status": -2 });
                return;
            }
            if (data.status === 0) {
                session.set("chatServerId", data.serverId);
                session.set("roomId", data.roomId);
                session.set("playerId", data.playerId);
            }
            next(data);
        });
    };
    ;
    return Handler;
}());
var onUserLeave = function (app, session) {
    console.log("one client out");
    if (session.get("chatServerId")) {
        app.rpc.toServer(session.get("chatServerId")).chat.chatRemote.leaveRoom({
            "roomId": session.get("roomId"),
            "playerId": session.get("playerId")
        });
    }
};
