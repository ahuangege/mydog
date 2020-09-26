import { Application, RpcClass } from "mydog";

declare global {
    interface Rpc {
        connector: {
            main: RpcClass<Remote>,
        }
    }
}

export default class Remote {

    constructor(app: Application) {
    }

    test(msg: any) {
        console.log(msg);
    }
}