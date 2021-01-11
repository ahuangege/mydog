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
     * 发送消息
     */
    sendMsg(id, msg) {
        let socket = this.rpcSockets[id];
        if (socket) {
            socket.send(msg);
        }
    }
    /**
     * 获取socket
     */
    getSocket(id) {
        return this.rpcSockets[id];
    }
}
exports.RpcSocketPool = RpcSocketPool;
