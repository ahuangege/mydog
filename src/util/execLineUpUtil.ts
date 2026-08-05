

/** 执行队列排队 */
export class ExecLineUpUtil {
    private list: Array<() => void> = [];
    private timer: any = null;
    private frame = 5; // 每秒tick次数
    private cntList: number[] = []; // 执行个数队列
    private tmpCntList: number[] = [];

    constructor(cntPerSecond: number) {


        const perCnt = Math.floor(cntPerSecond / this.frame);
        this.cntList = new Array(this.frame).fill(perCnt);

        let left = cntPerSecond - perCnt * this.frame;
        for (let idx = 0; idx < this.frame; idx++) {
            if (left <= 0) {
                break;
            }
            this.cntList[idx] += 1;
            left -= 1;
        }


        this.timer = setInterval(() => {
            this.check();
        }, 1000 / this.frame);
    }

    lineUp(callback: () => void) {
        this.list.push(callback);
    }

    remove(callback: () => void) {
        if (!callback) {
            return;
        }
        const idx = this.list.indexOf(callback);
        if (idx !== -1) {
            this.list.splice(idx, 1);
        }
    }


    private check() {
        if (this.list.length === 0) {
            return;
        }
        if (this.tmpCntList.length === 0) {
            this.tmpCntList = [...this.cntList];
        }

        const cnt = this.tmpCntList.pop() as number;
        const execList = this.list.splice(0, cnt);
        for (const one of execList) {
            one();
        }
    }


    release() {
        clearInterval(this.timer);
        this.timer = null;
        this.list = [];
    }

}