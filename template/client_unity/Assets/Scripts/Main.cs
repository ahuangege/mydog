using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using System;
using System.Text;

public class Main : MonoBehaviour
{
    public string host = "127.0.0.1";
    public int port = 4001;
    public Text infoText;
    public Text pongText;
    // Start is called before the first frame update
    void Start()
    {
        Network.OnOpen(Svr_onOpen);
        Network.OnClose(Svr_onClose);
        ConnectSvr();
    }

    // Update is called once per frame
    void Update()
    {
        Network.ReadMsg();
    }

    void ConnectSvr()
    {
        print("connectSvr");
        infoText.text = "连接服务器中...";
        Network.Connect(host, port);
    }

    void Svr_onOpen(byte[] bytes)
    {
        Debug.Log("socket open");
        infoText.text = "服务器已连接";
        Network.AddHandler(Cmd.connector_main_ping, Svr_pingBack);
    }

    void Svr_onClose(byte[] bytes)
    {
        Debug.Log("socket close");
        infoText.text = "连接服务器中...";
        StartCoroutine(ConnectLater());
    }

    IEnumerator ConnectLater()
    {
        yield return new WaitForSeconds(2);
        ConnectSvr();
    }

    public void Btn_ping()
    {
        var msg = new Req_ping();
        msg.msg = "ping";
        Network.SendMsg(Cmd.connector_main_ping, msg);
    }

    void Svr_pingBack(byte[] bytes)
    {
        var msg = Main.FromJson<Req_ping>(bytes);
        pongText.text = msg.msg;
        pongText.transform.parent.gameObject.SetActive(true);
    }

    public void Btn_yes()
    {
        pongText.transform.parent.gameObject.SetActive(false);
    }

    static T FromJson<T>(byte[] bytes)
    {
        return JsonUtility.FromJson<T>(Encoding.UTF8.GetString(bytes));
    }

    private void OnApplicationQuit()
    {
        Network.DisConnect();
    }
}

[Serializable]
public class Req_ping
{
    public string msg;
}

