import { Application } from "mydog";

declare global {
    interface Rpc {
        connector: {
            main: Remote,
        }
    }
}

export default class Remote {

    constructor(app: Application) {
    }

    async test(msg: string) {
        console.log("rpc get:", msg);
        return "haha";
    }
}