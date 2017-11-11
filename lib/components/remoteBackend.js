var nowFileName = "remoteBackend.js";
var msgCoder = require("./msgCoder.js");

var app = null;
var clients = {};

var remoteBackend = module.exports;

remoteBackend.init = function (_app) {
    app = _app;
    app.remoteBackend = this;
};

remoteBackend.addClient = function (sid, socket) {
    if (clients[sid]) {
        app.logger(nowFileName, "error", "- " + app.serverId + " : already has " + sid);
        socket.close();
        return;
    }
    socket.sid = sid;
    clients[sid] = socket;
};

remoteBackend.removeClient = function (sid) {
    delete clients[sid];
};

remoteBackend.sendSession = function (sid, uid, session) {
    if (clients[sid]) {
        var data = {
            "T": 2,
            "uid": uid,
            "session": session
        };
        data = msgCoder.encodeInnerData(data);
        clients[sid].send(data);
    }
};

remoteBackend.sendMsgByUidSid = function (cmdIndex, msg, uids, sids) {
    var group = {};
    for (var i = 0; i < sids.length; i++) {
        if (!group[sids[i]]) {
            group[sids[i]] = [];
        }
        group[sids[i]].push(uids[i]);
    }
    for (var sid in group) {
        if (clients[sid]) {
            var data = {
                "T": 1,
                "cmd": cmdIndex,
                "msg": msg,
                "uids": group[sid]
            };
            data = msgCoder.encodeInnerData(data);
            clients[sid].send(data);
        } else {
            app.logger(nowFileName, "error", "- " + app.serverId + " : has no " + sid);
        }
    }
};

