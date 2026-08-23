import {NS} from "@ns";

export async function main(ns:NS) {
    if (ns.args.length > 0) {
        const NA:string = "NULL PORT DATA";
        const portNum = Number(ns.args[0]);
        const port = ns.getPortHandle(portNum);
        while (true) {
            port.write("RESET");
            await ns.hack();
            await ns.sleep(300);
        }
    } else {
        while (true) await ns.hack();
    }
}
