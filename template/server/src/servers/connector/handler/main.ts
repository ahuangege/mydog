import { Application, Session } from "mydog";

export default class Handler {
    app: Application;
    constructor(app: Application) {
        this.app = app;
    }

    async ping(msg: { "msg": string }, session: Session, next: Function) {
        next({ "msg": "pong" });

        console.log("rpc start")
        const data = await this.app.rpc("connector-server-1").connector.main.test(msg.msg);
        console.log("rpc end : ", data);
    }
}