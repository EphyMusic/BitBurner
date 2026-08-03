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
                const threshSec = info[0];
                const currSec = info[1];
                const currMoney = info[3];
                const threshMoney = info[5];
                if ((currSec > threshSec) || (currMoney < threshMoney)) return;
            }
            inPort.write("RESET");
            await ns.hack();
            await ns.sleep(300);
        }
    } else {
        while (true) await ns.hack();
    }
}
