import { Session } from "../../components/session";
import Application from "../../application";

declare global {
    interface MyDogSysRpc {
        frontend: {
            sessionRemote: SessionRemote,
        }
    }
}

export default class SessionRemote {
    app: Application;
    constructor(app: Application) {
        this.app = app;
    }

    async getSession(uid: number) {
        const session = this.app.getSession(uid) as Session;
        if (!session) {
            return null;
        }
        return session.getSettings();
    }
}