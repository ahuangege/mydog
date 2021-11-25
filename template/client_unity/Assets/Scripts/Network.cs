using System;
using System.Collections.Generic;
using System.Net.Sockets;
using System.Text;
using UnityEngine;
using System.Timers;

/// <summary>
/// socket静态类
/// </summary>
public static class Network
{
    private static NetworkChild nowSocket = null;                                                //当前socket
    private static List<string> route = new List<string>();                                           //路由数组
    private static Dictionary<string, Action<byte[]>> handlers = new Dictionary<string, Action<byte[]>>();  //路由处理函数
    private static List<SocketMsg> msgCache = new List<SocketMsg>();                                  //缓存的消息列表
    private static object lockObj = new object();
    private static string md5 = "";     // route消息列表的md5
    private static string state_open = "state_open";
    private static string state_close = "state_close";

    /// <summary>
    /// 注册路由
    /// </summary>
    /// <param name="cmd">路由名称</param>
    /// <param name="handler">路由函数</param>
    public static void AddHandler(string cmd, Action<byte[]> handler)
    {
        handlers[cmd] = handler;
    }

    /// <summary>
    /// 移除消息监听
    /// </summary>
    /// <param name="target"></param>
    public static void RemoveThisHandlers(object target)
    {
        List<string> dels = new List<string>();
        foreach (var one in handlers)
        {
            if (one.Value.Target == target)
            {
                dels.Add(one.Key);
            }
        }
        foreach (var index in dels)
        {
            handlers.Remove(index);
        }
    }

    /// <summary>
    /// socket关闭事件的回调
    /// </summary>
    /// <param name="handler">回调函数</param>
    public static void OnClose(Action<byte[]> handler)
    {
        handlers[state_close] = handler;
    }

    /// <summary>
    /// 移除socket关闭事件的回调
    /// </summary>
    public static void OffClose()
    {
        handlers.Remove(state_close);
    }

    /// <summary>
    ///  socket打开事件的回调
    /// </summary>
    /// <param name="handler">回调函数</param>
    public static void OnOpen(Action<byte[]> handler)
    {
        handlers[state_open] = handler;
    }

    /// <summary>
    /// 移除socket打开事件的回调
    /// </summary>
    public static void OffOpen()
    {
        handlers.Remove(state_open);
    }

    /// <summary>
    /// 断开socket连接
    /// </summary>
    public static void DisConnect()
    {
        if (nowSocket != null)
        {
            nowSocket.DisConnect();
        }
        lock (lockObj)
        {
            msgCache.Clear();
        }
    }

    /// <summary>
    /// 连接服务器
    /// </summary>
    /// <param name="host">ip</param>
    /// <param name="port">端口</param>
    public static void Connect(string host, int port)
    {
        DisConnect();
        nowSocket = new NetworkChild();
        nowSocket.Connect(host, port);
    }

    /// <summary>
    /// 发送消息
    /// </summary>
    /// <param name="cmd">路由名称</param>
    /// <param name="data">数据</param>
    public static void SendMsg(string cmd, object data = null)
    {
        int cmdIndex = route.IndexOf(cmd);
        if (cmdIndex == -1)
        {
            Debug.Log("cmd not exists: " + cmd);
            return;
        }
        if (nowSocket == null)
        {
            Debug.Log("socket is null");
            return;
        }
        string msg;
        if (data == null)
        {
            msg = "null";
        }
        else
        {
            msg = JsonUtility.ToJson(data);
        }
        nowSocket.Send(cmdIndex, msg);
    }


    /// <summary>
    /// 读取消息
    /// </summary>
    public static void ReadMsg()
    {
        lock (lockObj)
        {
            if (msgCache.Count > 0)
            {
                SocketMsg msg = msgCache[0];
                msgCache.RemoveAt(0);
                if (handlers.ContainsKey(msg.msgId))
                {
                    handlers[msg.msgId](msg.msg);
                }
            }
        }
    }


    private class NetworkChild
    {
        private Socket mySocket = null;         //原生socket
        private bool isDead = false;            //是否已被弃用
        private Timer heartbeatTimer = null;    // 心跳
        private Timer heartbeatTimeoutTimer = null;    // 心跳回应超时


        enum ReadType
        {
            head,   // 头部
            some,   // 部分关键信息
            msg,    // 具体消息
        }

        public void DisConnect()
        {
            if (!isDead)
            {
                nowSocket = null;
                isDead = true;
                if (heartbeatTimer != null)
                {
                    heartbeatTimer.Enabled = false;
                    heartbeatTimer.Dispose();
                }
                if (heartbeatTimeoutTimer != null)
                {
                    heartbeatTimeoutTimer.Enabled = false;
                    heartbeatTimeoutTimer.Dispose();
                }
                try
                {
                    mySocket.Shutdown(SocketShutdown.Both);
                    mySocket.Close();
                }
                catch (Exception e)
                {
                    Debug.Log(e);
                }
            }
        }

        public void Send(int cmdIndex, string data)
        {
            byte[] bytes = Encode(cmdIndex, data);
            try
            {
                mySocket.BeginSend(bytes, 0, bytes.Length, SocketFlags.None, null, null);
            }
            catch (Exception e)
            {
                Debug.Log(e);
                SocketClose();
            }
        }

        public void Connect(string host, int port)
        {
            try
            {
                mySocket = new Socket(AddressFamily.InterNetwork, SocketType.Stream, ProtocolType.Tcp);
                mySocket.BeginConnect(host, port, AsyncConnectCallback, mySocket);
            }
            catch (Exception e)
            {
                Debug.Log(e);
                SocketClose();
            }
        }

        private void AsyncConnectCallback(IAsyncResult result)
        {

            try
            {   // 异步写入结束 
                mySocket.EndConnect(result);
                Recive();

                // 握手
                Proto_Handshake_req msgReq = new Proto_Handshake_req();
                msgReq.md5 = md5;
                byte[] byteMsg = Encoding.UTF8.GetBytes(JsonUtility.ToJson(msgReq));
                byte[] byteEnd = new byte[5 + byteMsg.Length];
                int msgLen = byteMsg.Length + 1;
                int index = 0;
                byteEnd[index++] = (byte)(msgLen >> 24 & 0xff);
                byteEnd[index++] = (byte)(msgLen >> 16 & 0xff);
                byteEnd[index++] = (byte)(msgLen >> 8 & 0xff);
                byteEnd[index++] = (byte)(msgLen & 0xff);
                byteEnd[index++] = 2 & 0xff;
                byteMsg.CopyTo(byteEnd, index);
                mySocket.BeginSend(byteEnd, 0, byteEnd.Length, SocketFlags.None, null, null);
            }
            catch (Exception e)
            {
                Debug.Log(e);
                SocketClose();
            }
        }

        private byte[] Encode(int cmd, string data)
        {
            byte[] byteMsg = Encoding.UTF8.GetBytes(data);
            byte[] byteEnd = new byte[byteMsg.Length + 7];
            int len = byteMsg.Length + 3;
            int index = 0;
            byteEnd[index++] = (byte)(len >> 24 & 0xff);
            byteEnd[index++] = (byte)(len >> 16 & 0xff);
            byteEnd[index++] = (byte)(len >> 8 & 0xff);
            byteEnd[index++] = (byte)(len & 0xff);
            byteEnd[index++] = 1;
            byteEnd[index++] = (byte)(cmd >> 8 & 0xff);
            byteEnd[index++] = (byte)(cmd & 0xff);
            byteMsg.CopyTo(byteEnd, index);
            return byteEnd;
        }


        private byte[] data = new byte[2 * 1024];   // socket接收字节流
        private ReadType readType = ReadType.head;  // 读取消息阶段
        private int msgType = 0;    // 消息类型
        private int byteIndex = 0;    // 当前字节流写入到哪个位置了
        private byte[] headBytes = new byte[5]; // 头部字节流，固定为5个字节
        private byte[] someBytes = new byte[2]; // 部分关键信息字节流，目前只有自定义消息用到，且固定为2个字节
        private byte[] msgBytes = new byte[0]; // 具体消息字节流
        private void Recive()
        {
            try
            {
                //开始接收数据  
                mySocket.BeginReceive(data, 0, data.Length, SocketFlags.None,
                asyncResult =>
                {
                    int length = mySocket.EndReceive(asyncResult);
                    if (readType == ReadType.head)
                    {
                        ReadHead(0, length);
                    }
                    else if (readType == ReadType.some)
                    {
                        ReadSome(0, length);
                    }
                    else if (readType == ReadType.msg)
                    {
                        ReadMsg(0, length);
                    }
                    Recive();
                }, null);
            }
            catch (Exception e)
            {
                Debug.Log(e);
                SocketClose();
            }
        }

        private void ReadHead(int readLen, int length)
        {
            readType = ReadType.head;
            if (readLen >= length)
            {
                return;
            }
            if (length - readLen < headBytes.Length - byteIndex) // 数据未全部到达
            {
                Array.Copy(data, readLen, headBytes, byteIndex, length - readLen);
                byteIndex += length - readLen;
            }
            else // 数据全到达
            {
                Array.Copy(data, readLen, headBytes, byteIndex, headBytes.Length - byteIndex);
                readLen += headBytes.Length - byteIndex;

                int allLen = (headBytes[0] << 24) | (headBytes[1] << 16) | (headBytes[2] << 8) | headBytes[3];
                msgType = headBytes[4];
                if (msgType == 1)   // 自定义消息
                {
                    msgBytes = new byte[allLen - 3];
                    byteIndex = 0;
                    ReadSome(readLen, length);
                }
                else
                {
                    msgBytes = new byte[allLen - 1];
                    byteIndex = 0;
                    ReadMsg(readLen, length);
                }
            }
        }

        private void ReadSome(int readLen, int length)
        {
            readType = ReadType.some;
            if (readLen >= length)
            {
                return;
            }
            if (length - readLen < someBytes.Length - byteIndex) // 数据未全部到达
            {
                Array.Copy(data, readLen, someBytes, byteIndex, length - readLen);
                byteIndex += length - readLen;
            }
            else // 数据全到达
            {
                Array.Copy(data, readLen, someBytes, byteIndex, someBytes.Length - byteIndex);
                readLen += someBytes.Length - byteIndex;

                byteIndex = 0;
                ReadMsg(readLen, length);
            }
        }
        private void ReadMsg(int readLen, int length)
        {
            readType = ReadType.msg;
            if (msgBytes.Length == 0)    // 具体消息长度就是0
            {
                HandleMsg();
                msgBytes = null;

                byteIndex = 0;
                ReadHead(readLen, length);
                return;
            }
            if (readLen >= length)
            {
                return;
            }
            if (length - readLen < msgBytes.Length - byteIndex)  // 数据未全部到达
            {
                Array.Copy(data, readLen, msgBytes, byteIndex, length - readLen);
                byteIndex += length - readLen;
            }
            else // 数据全到达
            {
                Array.Copy(data, readLen, msgBytes, byteIndex, msgBytes.Length - byteIndex);
                readLen += msgBytes.Length - byteIndex;

                HandleMsg();
                msgBytes = null;

                byteIndex = 0;
                ReadHead(readLen, length);
            }
        }

        private void HandleMsg()
        {
            if (msgType == 1)   // 自定义消息
            {
                int index = (someBytes[0] << 8) | someBytes[1];
                if (index < route.Count)
                {
                    SocketMsg msg = new SocketMsg();
                    msg.msgId = route[index];
                    msg.msg = msgBytes;
                    pushMsg(msg);
                }
            }
            else if (msgType == 2)   // 握手回调
            {
                string tmpStr = Encoding.UTF8.GetString(msgBytes);
                Proto_Handshake_rsp handshakeMsg = JsonUtility.FromJson<Proto_Handshake_rsp>(tmpStr);
                DealHandshake(handshakeMsg);
            }
            else if (msgType == 3)  // 心跳回调
            {
                if (heartbeatTimeoutTimer != null)
                {
                    heartbeatTimeoutTimer.Stop();
                }
            }
        }

        private void DealHandshake(Proto_Handshake_rsp msg)
        {
            if (msg.heartbeat > 0)
            {
                heartbeatTimer = new Timer();
                heartbeatTimer.Elapsed += SendHeartbeat;
                heartbeatTimer.Interval = msg.heartbeat * 1000;
                heartbeatTimer.Enabled = true;

                heartbeatTimeoutTimer = new Timer();
                heartbeatTimeoutTimer.Elapsed += HeartbeatTimeout;
                heartbeatTimeoutTimer.AutoReset = false;
                heartbeatTimeoutTimer.Interval = 4 * 1000;
            }
            md5 = msg.md5;
            if (msg.route != null)
            {
                route = new List<string>();
                for (int i = 0; i < msg.route.Length; i++)
                {
                    route.Add(msg.route[i]);
                }
            }

            SocketMsg openMsg = new SocketMsg();
            openMsg.msgId = state_open;
            pushMsg(openMsg);
        }

        private void SendHeartbeat(object source, ElapsedEventArgs e)
        {
            // 心跳
            byte[] bytes = new byte[5];
            bytes[0] = 1 >> 24 & 0xff;
            bytes[1] = 1 >> 16 & 0xff;
            bytes[2] = 1 >> 8 & 0xff;
            bytes[3] = 1 & 0xff;
            bytes[4] = 3 & 0xff;
            try
            {
                mySocket.BeginSend(bytes, 0, bytes.Length, SocketFlags.None, null, null);
                heartbeatTimeoutTimer.Start();
            }
            catch (Exception e1)
            {
                Debug.Log(e1);
                SocketClose();
            }

        }

        private void HeartbeatTimeout(object source, ElapsedEventArgs e)
        {
            SocketClose();
        }

        private void SocketClose()
        {
            if (!isDead)
            {
                SocketMsg msg = new SocketMsg();
                msg.msgId = state_close;
                pushMsg(msg);
                DisConnect();
            }
        }
        private void pushMsg(SocketMsg msg)
        {
            lock (lockObj)
            {
                msgCache.Add(msg);
            }
        }
    }

    /// <summary>
    /// 自定义消息
    /// </summary>
    private class SocketMsg
    {
        public string msgId;
        public byte[] msg;
    }

    /// <summary>
    /// 握手消息
    /// </summary>
    [Serializable]
    private class Proto_Handshake_req
    {
        public string md5 = "";
    }

    /// <summary>
    /// 握手消息
    /// </summary>
    [Serializable]
    private class Proto_Handshake_rsp
    {
        public float heartbeat = 0;
        public string md5 = "";
        public string[] route = null;
    }
}
