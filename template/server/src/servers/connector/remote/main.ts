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

    test(msg: string, cb: (err: boolean, data: string) => void) {
        console.log("rpc get:", msg);
        cb(false, "haha")
    }
}