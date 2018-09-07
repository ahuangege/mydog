module.exports = function (app) {
    return new room(app);
};

var room = function (app) {
    this.app = app;
    this.roomMgr = app.get("roomMgr");
    this.id = 1;
    this.name = "";
    this.password = "";
    this.players = {};
    this.playerId = 1;
    this.userNum = 0;

    this.playerIds = [];
    this.uids = [];
    this.sids = [];
};

var pro = room.prototype;

pro.init = function (_id, msg) {
    this.id = _id;
    this.name = msg.roomName;
    this.password = msg.password;
};

pro.addUser = function (msg) {
    if (this.password !== "" && this.password !== msg.password) {
        return {"status": -1};
    }

    var player = {
        "id": this.playerId,
        "uid": msg.uid,
        "sid": msg.sid,
        "name": msg.myName
    };
    this.broadcastMsg("onNewPlayer", player);

    this.players[player.id] = player;
    this.playerId++;
    this.roomMgr.userNum++;
    this.userNum++;
    this.playerIds.push(player.id);
    this.uids.push(player.uid);
    this.sids.push(player.sid);

    return {
        "status": 0,
        "roomName": this.name,
        "roomId": this.id,
        "playerId": player.id,
        "players": this.players
    };
};

pro.send = function (playerId, msg) {
    var player = this.players[playerId];
    if (player) {
        if (msg.type === 1) {
            msg.from = player.name;
            msg.fromId = player.id;
            this.broadcastMsg("onChat", msg);
        } else {
            var toPlayer = this.players[msg.to];
            if (toPlayer) {
                msg.to = toPlayer.name;
                msg.toId = toPlayer.id;
                msg.from = player.name;
                msg.fromId = player.id;
                var uids = [player.uid];
                var sids = [player.sid];
                if(player.id !== toPlayer.id){
                    uids.push(toPlayer.uid);
                    sids.push(toPlayer.sid);
                }
                this.app.sendMsgByUidSid("onChat", msg, uids, sids);
            }
        }
    }
};

pro.leaveRoom = function (playerId) {
    var player = this.players[playerId];
    if (player) {
        var index = this.playerIds.indexOf(playerId);
        this.playerIds.splice(index, 1);
        this.uids.splice(index, 1);
        this.sids.splice(index, 1);
        delete this.players[playerId];
        this.roomMgr.userNum--;
        this.userNum--;
        this.broadcastMsg("onLeave", {"id": playerId});
        if (this.userNum === 0) {
            this.roomMgr.destroyRoom(this.id);
        }
    }
};

pro.broadcastMsg = function (route, msg) {
    this.app.sendMsgByUidSid(route, msg, this.uids, this.sids);
};