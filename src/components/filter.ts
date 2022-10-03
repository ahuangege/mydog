import { Session } from "./session";


export class Filter {
    private befores: { "before": I_before }[] = [];
    private afters: { "after": I_after }[] = [];
    private globalBefores: { "before": I_globalBefore }[] = [];


    before(filter: { "before": I_before }) {
        this.befores.push(filter);
    }

    after(filter: { "after": I_after }) {
        this.afters.push(filter);
    }

    globalBefore(filter: { "before": I_globalBefore }) {
        this.globalBefores.push(filter);
    }

    beforeFilter(cmd: number, msg: any, session: Session, cb: (hasError?: boolean) => void) {
        let index = 0;
        let cbFunc = (hasError?: boolean) => {
            if (hasError || index >= this.befores.length) {
                cb(hasError);
                return;
            }
            let filter = this.befores[index];
            index++;
            filter.before(cmd, msg, session, cbFunc);
        }

        cbFunc();
    }

    afterFilter(cmd: number, msg: any, session: Session) {
        let index = 0;
        let cbFunc = () => {
            if (index >= this.afters.length) {
                return;
            }
            let filter = this.afters[index];
            index++;
            filter.after(cmd, msg, session, cbFunc);
        }

        cbFunc();
    }

    globalBeforeFilter(info: { cmd: number, msg: Buffer }, session: Session, cb: (hasError?: boolean) => void) {
        let index = 0;
        let cbFunc = (hasError?: boolean) => {
            if (hasError || index >= this.globalBefores.length) {
                cb(hasError);
                return;
            }
            let filter = this.globalBefores[index];
            index++;
            filter.before(info, session, cbFunc);
        }

        cbFunc();
    }
}


export interface I_before {
    (cmd: number, msg: any, session: Session, cb: (hasError?: boolean) => void): void
}

export interface I_after {
    (cmd: number, msg: any, session: Session, cb: () => void): void
}

export interface I_globalBefore {
    (info: { cmd: number, msg: Buffer }, session: Session, cb: (hasError?: boolean) => void): void
}