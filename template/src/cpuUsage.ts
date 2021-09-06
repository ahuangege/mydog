let last = process.cpuUsage();
let percent = "0.0";

setInterval(() => {
    let diff = process.cpuUsage(last);
    last = process.cpuUsage();
    percent = ((diff.user + diff.system) / (5000 * 1000) * 100).toFixed(1);
}, 5000);

export function getCpuUsage() {
    return percent;
}