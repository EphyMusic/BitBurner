import {NS} from "@ns";

export async function main(ns:NS) {
    if (ns.args.length > 0) {
        const NA:string = "NULL PORT DATA";
        const outPortNum = Number(ns.args[0]);
        const inPortNum = Number(ns.args[1]);
        const outPort = ns.getPortHandle(outPortNum);
        const inPort = ns.getPortHandle(inPortNum);
        while (true) {
            if (outPort.peek() !== NA) {
                const info = outPort.read();
                const currSec = info[1];
                const minSec = info[2];
                if ((currSec === minSec)) return;
            }
            inPort.write("RESET");
            await ns.weaken();
            await ns.sleep(300);
        }
    } else {
        while (true) await ns.weaken();
    }
}
