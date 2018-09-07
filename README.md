mydog - a node.js server
===========================


## installation

```bash
npm install mydog -g
```

## usage

* nodejs编写，运行需要安装node。
* mydog init ，选择编码语言（javascript / typescript)。然后mydog start
* 有一个聊天示例，并附有unity和cocos creator的客户端代码。可用于简单了解。
* 源代码量极少，可阅读，熟悉相关api。

## 简介

* Homepage: <https://github.com/ahuangege/mydog>
* master服务器，负责启动并管理所有服务器的增加和移除。
* 前端服务器，（frontend: true）负责承载用户的连接。
* 后端服务器， 通常处理游戏逻辑。
* alone选项表示，该服务器是否是独立的。
* rpc服务器，负责中转服务器之间的rpc调用。
* 相关概念与使用可参考pomelo

## 架构图

![image](https://github.com/ahuangege/mydog/blob/master/lib/mydog.png)
