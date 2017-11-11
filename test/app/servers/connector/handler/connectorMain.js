module.exports = function (app) {
    return new Handler(app);
};

var Handler = function (app) {
    this.app = app;
};

var uid = 1;

Handler.prototype.getChatInfo = function (msg, session, next) {
    if(!session.uid){
        session.bind(uid++);
        session.onclosed(onUserLeave.bind(null, this.app));
    }
    this.app.rpc.chat.chatRemote.getRooms(msg.id, function (err, data) {
        if(err){
            next({});
            return;
        }
        next(data);
    });
};

Handler.prototype.newRoom = function (msg, session, next) {
    msg.uid = session.uid;
    msg.sid = session.sid;
    var self = this;
    self.app.rpc.chat.chatRemote.newRoom(msg.id, msg, function (err, data) {
        if(err){
            next({"status": -2});
            return;
        }
        if(data.status === 0){
            session.set("chatServerId", data.serverId);
            session.set("roomId", data.roomId);
            session.set("playerId", data.playerId);
        }
        next(data);
    });
};

Handler.prototype.joinRoom = function (msg, session, next) {
    msg.uid = session.uid;
    msg.sid = session.sid;
    var self = this;
    self.app.rpc.chat.chatRemote.joinRoom(msg.id, msg, function (err, data) {
        if(err){
            next({"status": -2});
            return;
        }
        if(data.status === 0){
            session.set("chatServerId", data.serverId);
            session.set("roomId", data.roomId);
            session.set("playerId", data.playerId);
        }
        next(data);
    });
};

var onUserLeave = function (app, session) {
    console.log("one client out");
    if (session.get("chatServerId")) {
        app.rpc.chat.chatRemote.leaveRoom(session.get("chatServerId"), {
            "roomId": session.get("roomId"),
            "playerId": session.get("playerId")
        });
    }
};