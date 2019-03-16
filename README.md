mydog - a node.js server
===========================


## installation

```bash
npm install mydog -g
```

## usage

* typescript编写。
* 在cmd窗口运行 mydog init 初始化项目。
* 有一个聊天示例，并附有unity和cocos creator的客户端代码。可用于简单了解。
* 源代码量极少，可阅读，熟悉相关api。

## 简介

* Homepage: <https://github.com/ahuangege/mydog>
* master服务器，负责启动并管理所有服务器的增加和移除。
* 前端服务器，（frontend: true）负责承载用户的连接。
* 后端服务器， 通常处理游戏逻辑。
* alone选项表示，该服务器是否是独立的，如果独立，则表示不与前端或后端相连接。
* rpc服务器，负责中转服务器之间的rpc调用。

## QQ群

* 欢迎加入qq群，一起学习：875459630

## 架构图

![image](https://github.com/ahuangege/mydog/blob/master/mydog.png)

## 概览

* 项目目录结构 <br>
![image](https://github.com/ahuangege/mydog/blob/master/struct.png)

1、基本配置文件在 config/sys 目录下。master.ts为master服务器端口配置，rpc.ts为rpc服务器端口配置，<br>
servers.ts为开发者自定义的服务器配置，route.ts为通信消息列表。<br>

2、app/servers 下为所有的通信消息入口。如 chat 表示聊天服务器，handler目录下接收客户端消息，remote目录<br>
下接收服务器之间的rpc调用消息。客户端发送"chat.chatMain.send"消息，服务器将会在chatMain.ts中的send方法<br>
处收到消息。开发者调用 app.rpc.toServer("chat-server-1").chat.chatRemote.leaveRoom()，将会在chat目录<br>
下的chatRemote.ts文件里的leaveRoom方法中收到消息。rpc调用如果传入了回调，则接收处必须调用回调，否则<br>
会触发超时。

3、前端服务器，通常情况下作为网关，将客户端消息路由到后端服务器，后端某一类服务器通常不止一个，这个时候<br>
通过配置前置路由，如下:
```
app.route("chat", function (app: Application, session: Session, serverType: string, cb: (serverId: string)=>void) {
    cb(session.get("chatServerId"));
});
```
通常通过session获取想要到达的某一个后端服务器。

4、rpc调用有两种方式：一个是app.rpc.toServer("serverId").chat...，"serverId"为服务器的名字，即servers.ts<br>
中的id字段，直接发送至该服务器，"serverId"为"*"时，将会发送给所有的该类服务器（注意，此时回调接收的数据结构<br>
有所改变，请开发者自行测试加深印象）。另一个方式是 app.rpc.route(routeParam).chat...，routeParam为自定义的<br>
数据,这种方式通过配置rpc前置路由，如下：
```
app.rpcRoute("chat", function (app: Application, routeParam: any, cb: (serverId: string) => void) {
    cb("chat-server-1");
});
```

5、一些可选配置
```
app.set_rpcConfig({ "timeOut": 15 });
app.set_connectorConfig({ "connector": "net", "heartbeat": 6, "maxConnectionNum": 2000 });
app.set_encodeDecodeConfig({ "decode": decode, "encode": encode });
function decode(cmdId: number, msgBuf: Buffer, session: Session): any {
    return JSON.parse(msgBuf.toString());
}
function encode(cmdId: number, data: any): Buffer {
    return Buffer.from(JSON.stringify(data));
}
```
set_rpcConfig为配置rpc超时时间。<br>
set_connectorConfig为前端服务器的配置，通信协议、心跳和最大连接数。<br>
set_encodeDecodeConfig为配置编码解码回调（默认）。<br>

6、session类<br>
session中存着两个重要字段，uid和sid，sid是前端服务器的名字，uid是socket连接绑定的唯一标识，服务器推送消息时，<br>
依据这两个字段。前端服务器中调用bind方法，绑定唯一uid，session中可通过set和get方法存储自定义信息。后端服务器<br>
中的session是前端服务器在每次转发消息时对前端session的复制，后端自定义存储后必须调用apply方法，才能转存<br>
到前端服务器。

7、服务器推送消息<br>
前端服务器可以通过app.sendAll()和app.sendMsgByUid()向本服务器的client推送消息。<br>
后端服务器通过app.sendMsgByUidSid()推送消息。