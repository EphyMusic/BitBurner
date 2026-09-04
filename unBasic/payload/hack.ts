// import {NS} from "@ns";

export async function main(ns:NS) {
    if (ns.args.length > 0) {
        const portNum = Number(ns.args[0]);
        const target = String(ns.args[1]);
        const port = ns.getPortHandle(portNum);
        if (target === "self") {
            while (true) {
                port.write("RESET");
                await ns.hack();
                port.clear();
            }
        } else {
            while (true) {
                port.write("RESET");
                await ns.hack(target);
                port.clear();
            }
        }
    } else {
        while (true) await ns.hack();
    }
}
