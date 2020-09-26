import { Application, Session } from "mydog";

export default class Handler {
    app: Application;
    constructor(app: Application) {
        this.app = app;
    }

    ping(msg: any, session: Session, next: Function) {
        next("hello!");
        this.app.rpc("*").connector.main.test(msg);
    }
}

