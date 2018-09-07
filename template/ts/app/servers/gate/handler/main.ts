import { Application, Session } from "mydog";

export default function(app:Application){
    return new Handler(app);
}

class Handler{
    app: Application;
    constructor(app:Application){
        this.app = app;
    }
    login(msg: any, session: Session, next: Function){
        let connectors = this.app.getServersByType("connector");
        let min = 99999;
        let index = 0;
        for(let i = 0; i < connectors.length; i++){
            let num = connectors[i].userNum || 0;
    
            if(num < min){
                min = num;
                index = i;
            }
        }
        let data = {
            "host": connectors[index].host,
            "port": connectors[index].port,
            "chat": this.app.getServersByType("chat")
        };
        next(data);
    }
}