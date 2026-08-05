import Application from "../../application";


declare global {
    interface MyDogSysRpc {
        backend: {
            test: Remote,
        }
    }
}

export default class Remote {

    constructor(app: Application) {
    }

    async test(msg: string) {
        console.log("getTest:", msg);
        return "haha";
    }
}