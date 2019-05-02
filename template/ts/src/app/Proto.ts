/**
 * 服务器列表信息
 */
export interface gate_main_login_rsp {
    "host": string,
    "port": number,
    "chat": { "id": string, "name": string }[]
}


/**
 * 房间列表信息协议
 */
export interface connector_main_getChatInfo_rsp {
    "rooms": connector_main_getChatInfo_room_info[]
}

export interface connector_main_getChatInfo_room_info {
    "id": number,
    "name": string,
    "password": string
}

export interface connector_main_newRoom_req {
    id: string,
    myName: string,
    roomId: number,     // 加入房间时使用
    roomName: string,   // 新建房间时使用
    password: string,
    uid: number,
    sid: string
}

export interface join_room_rsp {
    status: number;
    roomName: string;
    roomId: number;
    playerId: number;
    serverId: string;
    serverName: string;
    players: player_info[];
}

/**
 * 玩家信息
 */
export interface player_info {
    "id": number,
    "uid": number,
    "sid": string,
    "name": string
}

/**
 * 聊天协议
 */
export interface chat_send_req {
    "type": number,
    "toId": number,
    "msg": string
}

export interface onChat_info {
    type: number,
    msg: string,
    fromId: number,
    from: string;
    toId: number;
    to: string;
}