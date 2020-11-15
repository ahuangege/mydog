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

    test(msg: string) {
        console.log("rpcMsg", msg);
    }
}