import { Application, Session } from "mydog";
import Proto = require("../../../app/Proto");

export default function (app: Application) {
    return new Handler(app);
}

class Handler {
    app: Application;
    constructor(app: Application) {
        this.app = app;
    }
    login(msg: any, session: Session, next: (info: Proto.gate_main_login_rsp) => void) {
        let connectors = this.app.getServersByType("connector");
        let min = 99999;
        let index = 0;
        for (let i = 0; i < connectors.length; i++) {
            let num = connectors[i].userNum || 0;

            if (num < min) {
                min = num;
                index = i;
            }
        }
        let data = {
            "host": connectors[index].host,
            "port": connectors[index].clientPort,
            "chat": this.app.getServersByType("chat") as any
        };
        next(data);
    }
}

