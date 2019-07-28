import { Application, Session } from "mydog";
import Proto = require("../../../app/Proto");



export default class Handler {
    app: Application;
    constructor(app: Application) {
        this.app = app;
    }


    login(msg: any, session: Session, next: (info: Proto.gate_main_login_rsp) => void) {
        let connectors = this.app.getServersByType("connector");
        let index = Math.floor(Math.random() * connectors.length);
        let data = {
            "host": connectors[index].host,
            "port": connectors[index].clientPort,
            "chat": this.app.getServersByType("chat") as any
        };
        next(data);
    }
}

