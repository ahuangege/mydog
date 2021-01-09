
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
        let socket = this.rpcSockets[id];
        if (socket) {
            socket.send(msg);
        }
    }

    /**
     * 获取socket
     */
    getSocket(id: string) {
        return this.rpcSockets[id];
    }
}

export interface I_RpcSocket {
    send(data: Buffer): void;
}