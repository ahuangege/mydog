"use strict";
/**
 * 后端服务器，对前端服务器连接的管理
 */
Object.defineProperty(exports, "__esModule", { value: true });
var msgCoder_1 = require("./msgCoder");
var app;
var clients = {};
function init(_app) {
    app = _app;
}
exports.init = init;
function addClient(sid, socket) {
    if (clients[sid]) {
        clients[sid].close();
    }
    clients[sid] = socket;
}
exports.addClient = addClient;
;
function removeClient(sid) {
    delete clients[sid];
}
exports.removeClient = removeClient;
;
function sendSession(session) {
    if (clients[session.sid]) {
        var msgBuf = Buffer.from(JSON.stringify(session));
        var buf = Buffer.allocUnsafe(5 + msgBuf.length);
        buf.writeUInt32BE(1 + msgBuf.length, 0);
        buf.writeUInt8(2 /* applySession */, 4);
        msgBuf.copy(buf, 5);
        clients[session.sid].send(buf);
    }
}
exports.sendSession = sendSession;
;
function sendMsgByUidSid(cmdIndex, msg, uids, sids) {
    var group = {};
    for (var i = 0; i < sids.length; i++) {
        if (!group[sids[i]]) {
            group[sids[i]] = [];
        }
        group[sids[i]].push(uids[i]);
    }
    var msgBuf = null;
    for (var sid in group) {
        if (clients[sid]) {
            if (!msgBuf) {
                msgBuf = msgCoder_1.encodeRemoteData_1(cmdIndex, msg);
            }
            var buf = msgCoder_1.encodeRemoteData_2(group[sid], cmdIndex, msgBuf);
            clients[sid].send(buf);
        }
    }
}
exports.sendMsgByUidSid = sendMsgByUidSid;
;
