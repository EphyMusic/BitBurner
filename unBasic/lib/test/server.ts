// import { Server,NS } from "@ns";
import {colorize} from "../common"

class ScannedServer {
    server: Server;
    path: string[];
    state: string;
    weakening: boolean;
    constructor(ns:NS,hostname:string,path:string[]) {
        this.server = ns.getServer(hostname);
        this.path = path;
        this.state = "HACK";
        this.initState(ns)
        this.weakening = false;
    }

    refreshServer(ns:NS) {
        this.server = ns.getServer(this.server.hostname);
    }

    _calculateThreads(ns: NS, script: string): number {
        const freeRam = this.server.maxRam - this.server.ramUsed;
        const scriptRam = ns.getScriptRam(script);
        return Math.max(0, Math.floor(freeRam / scriptRam));
    }

    killOld(ns: NS): boolean {
        const old = ns.ps(this.server.hostname);
        if (old.length > 0) {
            const res = []
            for (const proc of old) {
                res.push(ns.kill(proc.pid));
            }
            for (const r of res) {
                if (!r) return false;
            }
            return true;
        }
        return false;
    }

    sendFiles(ns: NS): boolean {
        const files = [
            "/unBasic/payload/weaken.ts",
            "/unBasic/payload/grow.ts",
            "/unBasic/payload/hack.ts",
            "/unBasic/payload/share.ts"
        ];
        const target = this.server.hostname;

        for (const file of files) {
            const finalFile = file.replace("/unBasic","");
            if (!ns.fileExists(file, "home")) return false;
            if (!ns.scp(file, target, "home")) return false;
            ns.mv(target,file,finalFile);
        }
        return true;
    }

    doAction(ns:NS,payload:string):boolean {
        const srcFile = "/unBasic" + payload
        if (ns.ps(this.server.hostname).length > 0 && !this.killOld(ns)) return false;
        const threads = this._calculateThreads(ns, srcFile);
        if (!isFinite(threads) || threads === 0) return false;
        const target = this.server.hostname;
        if (!ns.exec(payload, target, threads)) {
            return false;
        }
        return true;
    }

    alreadyRunning(ns:NS,payload:string):boolean {
        const procs = ns.ps(this.server.hostname);
        if (procs.length > 0) {
            for (const proc of procs) {
                if (proc.filename === payload) {
                    return true;
                }
            }
            return false;
        }
        return false;
    }

    initState(ns:NS) {
        if (!this.server.moneyMax || this.server.moneyMax == 0) {this.state = "SHARE";} else {this.state = "HACK";}
    }

    runSelf(ns:NS) {
        this.refreshServer(ns);
        if (!this.sendFiles(ns)) {ns.tprint(`ERROR:${this.server.hostname} cannot send files.`); return;}
        if (this.server.hasAdminRights) {
            switch (this.state) {
                case "GROW":
                case "HACK":
                    return this.runState(ns);
                case "SHARE":
                    return this.runShare(ns);
            }
        }
    }
    
    runState(ns:NS) {
        const currentMoney = this.server.moneyAvailable as number;
        const currentSecurity = this.server.hackDifficulty as number;
        const maxMoney = this.server.moneyMax as number;
        const minimumSecurity = this.server.minDifficulty as number;
        const procs = ns.ps(this.server.hostname);
        switch (this.state) {
            case "GROW":
                if (this.weakening) {
                    if (currentSecurity !== minimumSecurity) {
                        if (this.alreadyRunning(ns,"/payload/weaken.ts")) return;
                        this.doAction(ns,"/payload/weaken.ts");
                        return;
                    } else {
                        this.weakening = false;
                        return;
                    }
                    
                } else if (currentMoney !== maxMoney) {
                    if (!(currentSecurity > minimumSecurity * 1.2)) {
                        if (this.alreadyRunning(ns,"/payload/grow.ts")) return;
                        this.doAction(ns,"/payload/grow.ts");
                        return;
                    } else {
                        this.weakening = true;
                        return;
                    }
                } else {
                    this.state = "HACK";
                    return;
                }
            case "HACK":
                if (this.weakening) {
                    if (currentSecurity !== minimumSecurity) {
                        if (this.alreadyRunning(ns,"/payload/weaken.ts")) return;
                        this.doAction(ns,"/payload/weaken.ts");
                        return;
                    } else {
                        this.weakening = false;
                        return;
                    }
                    
                } else if (!(currentMoney < maxMoney / 10)) {
                    if (!(currentSecurity > minimumSecurity * 1.2)) {
                        if (this.alreadyRunning(ns,"/payload/hack.ts")) return;
                        this.doAction(ns,"/payload/hack.ts");
                        return;
                    } else {
                        this.weakening = true;
                        return;
                    }
                } else {
                    this.state = "GROW";
                }
            default: return;
        }
    }

    runShare(ns:NS) {
        if (this.alreadyRunning(ns,"/payload/share.ts")) return;
        this.doAction(ns,"/payload/share.ts");
        return;
    }
}

export function bDoorWrite(ns: NS, servers: ScannedServer[]) {
    if (!ns.fileExists("backdoors.txt")) ns.write("backdoors.txt");
    let fileContent: string = ""
    for (const server of servers) {
        if (server.server.hostname === "home") continue;
        if (!server.server.hasAdminRights || server.server.purchasedByPlayer) continue;
        if (!server.server.backdoorInstalled) fileContent += `${server.path.join(";connect ")}; backdoor\n`
    }
    if (fileContent !== ns.read("backdoors.txt")) ns.write("backdoors.txt", fileContent, "w")
}

