mydog - a node.js server
===========================


## installation

```bash
npm install mydog
```

## usage

* nodejs编写，运行需要安装node。
* test文件夹下，有一个聊天示例，并附有unity和cocos creator的客户端代码。可用于简单了解。将test文件夹里面的所有文件复制到根目录，双击start.bat即可。
* 源代码量极少，可阅读，熟悉相关api。

## 简介

* Homepage: <https://github.com/ahuangege/mydog>
* master服务器，负责启动并管理所有服务器的增加和移除（可单独启动）。
* 前段服务器，（frontend: true）负责承载用户的连接。
* 后端服务器， 通常处理游戏逻辑。
* rpc服务器，负责中转服务器之间的rpc调用。

* 启动所有服务器；  node app.js
*
* 单独启动master服务器:  node app.js startMode=alone
* 
* 单独启动其他服务器：node app.js serverType=connector id=connector-server-1
*    
* 单独启动其他服务器指定端口：     node app.js serverType=connector id=connector-server-1 port=3001
*  