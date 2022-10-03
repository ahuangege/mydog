import { Application, Session } from "mydog";

export default class Handler {
    app: Application;
    constructor(app: Application) {
        this.app = app;
    }

    ping(msg: { "msg": string }, session: Session, next: Function) {
        next({ "msg": "pong" });

        console.log("start rpc")
        this.app.rpc("connector-server-1").connector.main.test(msg.msg, (err, data) => {
            console.log("end rpc:", err, data);
        });
    }
}