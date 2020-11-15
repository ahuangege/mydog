import { Application, Session } from "mydog";

export default class Handler {
    app: Application;
    constructor(app: Application) {
        this.app = app;
    }

    ping(msg: { "msg": string }, session: Session, next: Function) {
        next({ "msg": "pong" });
        this.app.rpc("*").connector.main.test(msg.msg);
    }
}