// Learn TypeScript:
//  - https://docs.cocos.com/creator/manual/en/scripting/typescript.html
// Learn Attribute:
//  - https://docs.cocos.com/creator/manual/en/scripting/reference/attributes.html
// Learn life-cycle callbacks:
//  - https://docs.cocos.com/creator/manual/en/scripting/life-cycle-callbacks.html

import { cmd } from "./cmdClient";
import { network } from "./network";

const { ccclass, property } = cc._decorator;

@ccclass
export default class NewClass extends cc.Component {

    @property(cc.String)
    private host: string = "127.0.0.1";
    @property(cc.Integer)
    private port: number = 4001;

    @property(cc.Label)
    private infoLabel: cc.Label = null;
    @property(cc.Label)
    private pongLabel: cc.Label = null;


    start() {
        network.onOpen(this.svr_onOpen, this);
        network.onClose(this.svr_onClose, this);
        this.connectSvr();
    }

    update() {
        network.readMsg();
    }

    private connectSvr() {
        this.infoLabel.string = "连接服务器中..."
        network.connect(this.host, this.port);
    }

    private svr_onOpen() {
        console.log("socket onopen");
        this.infoLabel.string = "服务器已连接"
        network.addHandler(cmd.connector_main_ping, this.svr_pingBack, this);
    }

    private svr_onClose() {
        console.log("socket onclose");
        this.infoLabel.string = "连接服务器中..."
        this.scheduleOnce(() => {
            this.connectSvr();
        }, 2)
    }

    private btn_ping() {
        network.sendMsg(cmd.connector_main_ping, { "msg": "ping" });
    }
    private svr_pingBack(msg: { "msg": string }) {
        this.pongLabel.string = msg.msg;
        this.pongLabel.node.parent.active = true;
    }

    private btn_yes() {
        this.pongLabel.node.parent.active = false;
    }

}
