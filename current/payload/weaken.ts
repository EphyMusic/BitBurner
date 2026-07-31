// import {NS} from "@ns";

export async function main(ns:NS) {
    if (ns.args.length > 0) {
        const NA:string = "NULL PORT DATA";
        const portNum = Number(ns.args[0]);
        const port = ns.getPortHandle(portNum);
        while (true) {
            if (port.peek() !== NA) {
                const info = port.read();
                const currSec = info[1];
                const minSec = info[2];
                if ((currSec === minSec)) return;
            }
            await ns.weaken();
        }
    } else {
        while (true) await ns.weaken();
    }
}
