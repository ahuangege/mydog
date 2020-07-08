
let startUsage = process.cpuUsage();
let percent: string = "0.0";

// cpu占用率监控
setInterval(() => {
    let tmp = process.cpuUsage();
    let diff = process.cpuUsage(startUsage);
    startUsage = tmp;
    let all = diff.system + diff.user;
    if (all === 0) {
        percent = "0.0";
    } else {
        percent = (diff.user / all * 100).toFixed(1);
    }
}, 5000)

export function getCpuUsage() {
    return percent;
}