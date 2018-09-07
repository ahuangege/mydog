var nowFileName = __filename;
var msgCoder = require("./msgCoder.js");
var define = require("../util/define.js");

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

remoteBackend.sendSession = function (session) {
    if (clients[session.sid]) {
        var msgBuf = Buffer.from(JSON.stringify(session));
        var buf = Buffer.allocUnsafe(5 + msgBuf.length);
        buf.writeUInt32BE(1 + msgBuf.length);
        buf.writeUInt8(define.Back_To_Front.applySession, 4);
        msgBuf.copy(buf, 5);
        clients[session.sid].send(buf);
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
            var buf = msgCoder.encodeRemoteData(group[sid], cmdIndex, msg);
            clients[sid].send(buf);
        }
    }
};

