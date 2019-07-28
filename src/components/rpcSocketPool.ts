
export class RpcSocketPool {
    private rpcSockets: { [id: string]: I_RpcSocket } = {};

    /**
     * 添加socket
     */
    addSocket(id: string, socket: I_RpcSocket) {
        this.rpcSockets[id] = socket;
    }

    /**
     * 移除socket
     */
    removeSocket(id: string) {
        delete this.rpcSockets[id];
    }

    /**
     * 是否有某socket
     */
    hasSocket(id: string) {
        return this.rpcSockets[id];
    }

    /**
     * 发送消息
     */
    sendMsg(id: string, msg: Buffer) {
        if (this.rpcSockets[id]) {
            this.rpcSockets[id].send(msg);
        }
    }
}

interface I_RpcSocket {
    send(data: Buffer): void;
}