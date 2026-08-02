import { Session } from "./session";


export class Filter {
    private beforeList: { "before": I_before }[] = [];
    private afterList: { "after": I_after }[] = [];
    private globalBeforeList: { "globalBefore": I_globalBefore }[] = [];


    before(filter: { "before": I_before }) {
        this.beforeList.push(filter);
    }

    after(filter: { "after": I_after }) {
        this.afterList.push(filter);
    }

    globalBefore(filter: { "globalBefore": I_globalBefore }) {
        this.globalBeforeList.push(filter);
    }

    async beforeFilter(cmd: number, msg: any, session: Session): Promise<boolean> {
        for (const one of this.beforeList) {
            const ok = await one.before(cmd, msg, session);
            if (!ok) {
                return false;
            }
        }
        return true;
    }

    async afterFilter(cmd: number, msg: any, session: Session) {
        for (const one of this.afterList) {
            const ok = await one.after(cmd, msg, session);
            if (!ok) {
                return;
            }
        }

    }

    async globalBeforeFilter(info: { cmd: number, msg: Buffer }, session: Session): Promise<boolean> {
        for (const one of this.globalBeforeList) {
            const ok = await one.globalBefore(info, session);
            if (!ok) {
                return false;
            }
        }
        return true;
    }
}


export interface I_before {
    (cmd: number, msg: any, session: Session): Promise<boolean>
}

export interface I_after {
    (cmd: number, msg: any, session: Session): Promise<boolean>
}

export interface I_globalBefore {
    (info: { cmd: number, msg: Buffer }, session: Session): Promise<boolean>
}