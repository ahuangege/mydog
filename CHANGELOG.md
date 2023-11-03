## [ 2.4.0 ] - 2023-11-3
* rpc 调用不再支持回调形式，只能 await 形式
* rpc 调用发生错误时，不再返回 undefined 来区分，而是正常的 reject
<br><br>

## [ 2.3.6 ] - 2022-11-17
* rpc 调用回调形式和 await 形式合并为单个 api，根据调用形式来区分
* rpc 增加 intervalCacheLen 配置项，防止单次申请过大 Buffer
<br><br>

## [ 2.3.5 ] - 2022-10-04
* rpc 消息缓存功能的一个 bug 修改
<br><br>

## [ 2.3.4 ] - 2022-10-03
* 增加 filter 功能，移除 cmdFilter
* rpc 消息增加消息缓存功能。回调形式的 rpcErr，由枚举改为bool类型，可以认为 rpc 调用只有超时这一错误。
* 添加服务器全部启动成功的通知。
* 其他部分修改
<br><br>

## [ 2.3.3 ] - 2022-08-27
* monitor.ts 以前未进行 try catch
* 内部日志重新整理
* 启动时，脚本执行顺序修改
* mydog start/remove/send 里面的 serverId 可使用范围参数，如 con-1~3 表示 con-1 con-2 con-3
<br><br>

## [ 2.3.2 ] - 2021-12-03
* 修改 mydog cmd 命令，客户端cmd提示文件由开发者自己创建。
* 增加 mydog send 命令，可发送简单的消息给 mydog 框架。
* 添加服务器关闭监听，在 mydog stop/remove/removeT 等命令下的移除，添加回调给开发者。
<br><br>

## [ 2.3.1 ] - 2021-11-25
* 增加 session.send() 方法。目的：在前端服未绑定 uid 时，也能发消息给对应客户端
* 客户端网络模块：creator主动断开连接时清空消息列表防止收到 onclose 事件，unity 的解析优化。同时都修改了监听逻辑，不再需要等待网络连接成功后才能注册消息监听了。
* 移除 commander 依赖模块，自己实现一个简单的。（尽量少的依赖包）
* 保证在主动关闭客户端时，缓存的消息列表都能下发到客户端。
<br><br>

## [ 2.3.0 ] - 2021-09-08
* 客户端握手时提供md5，避免消息号文件每次新建网络连接时都下发。
* rpcAwait 内部错误时，返回的数据由 null 改为 undefined，null 可用于开发者自己使用
* 优化解码
* wss合并到ws里
<br><br>