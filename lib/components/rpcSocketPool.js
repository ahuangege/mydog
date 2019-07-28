"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var RpcSocketPool = /** @class */ (function () {
    function RpcSocketPool() {
        this.rpcSockets = {};
    }
    /**
     * 添加socket
     */
    RpcSocketPool.prototype.addSocket = function (id, socket) {
        this.rpcSockets[id] = socket;
    };
    /**
     * 移除socket
     */
    RpcSocketPool.prototype.removeSocket = function (id) {
        delete this.rpcSockets[id];
    };
    /**
     * 是否有某socket
     */
    RpcSocketPool.prototype.hasSocket = function (id) {
        return this.rpcSockets[id];
    };
    /**
     * 发送消息
     */
    RpcSocketPool.prototype.sendMsg = function (id, msg) {
        if (this.rpcSockets[id]) {
            this.rpcSockets[id].send(msg);
        }
    };
    return RpcSocketPool;
}());
exports.RpcSocketPool = RpcSocketPool;
