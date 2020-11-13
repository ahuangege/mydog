"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RpcSocketPool = void 0;
class RpcSocketPool {
    constructor() {
        this.rpcSockets = {};
    }
    /**
     * 添加socket
     */
    addSocket(id, socket) {
        this.rpcSockets[id] = socket;
    }
    /**
     * 移除socket
     */
    removeSocket(id) {
        delete this.rpcSockets[id];
    }
    /**
     * 是否有某socket
     */
    hasSocket(id) {
        return this.rpcSockets[id];
    }
    /**
     * 发送消息
     */
    sendMsg(id, msg) {
        if (this.rpcSockets[id]) {
            this.rpcSockets[id].send(msg);
        }
    }
}
exports.RpcSocketPool = RpcSocketPool;
