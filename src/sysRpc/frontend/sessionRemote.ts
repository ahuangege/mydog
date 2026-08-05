import Application from "../../application";

declare global {
    interface MyDogSysRpc {
        frontend: {
            sessionRemote: SessionRemote,
        }
    }
}

export default class SessionRemote {

    constructor(app: Application) {
    }

    async test(msg: string) {
        console.log("rpc get:", msg);
        return "haha";
    }
}