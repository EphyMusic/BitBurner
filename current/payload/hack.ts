//import {NS} from "@ns";

export async function main(ns:NS) {
    if (ns.args.length > 0) {
        const NA:string = "NULL PORT DATA";
        const portNum = Number(ns.args[0]);
        const port = ns.getPortHandle(portNum);
        while (true) {
            if (port.peek() !== NA) {
                const info = port.read();
                const threshSec = info[0];
                const currSec = info[1];
                const currMoney = info[3];
                const threshMoney = info[5];
                if ((currSec > threshSec) || (currMoney < threshMoney)) return;
            }
            await ns.hack();
        }
    } else {
        while (true) await ns.hack();
    }
}
