import { Server,NS } from "@ns";
import {colorize} from "./common"

export class ScannedServer {
    server: Server;
    path: string[];
    outPort: number;
    inPort: number;
    timeActive: number = 0;
    lastSec: number;
    lastMon: number;
    monColor: { r: number, g: number, b: number };
    secColor: { r: number, g: number, b: number };
    servColor: { r: number, g: number, b: number };
    actColor: { r: number, g: number, b: number };
    keepGrowing: boolean = false
    timer:number = 0
    error:string | null = null

    constructor(ns: NS, name: string, path: string[], port: number) {
        this.server = ns.getServer(name);
        this.path = path;
        this.outPort = port;
        this.inPort = port + 1;
        this.lastSec = this.server.hackDifficulty ?? 0;
        this.lastMon = this.server.moneyAvailable ?? 0;
        this.monColor = { r: 50, g: 100, b: 255 };
        this.secColor = { r: 50, g: 100, b: 255 };
        const sB = Math.random() * 255;
        this.servColor = { r: 150, g: 255, b: sB };
        this.actColor = { r: 255, g: 255, b: 255 };
    }

    normalizeColor() {
        const interval = 10
        if (this.monColor.r > 50) this.monColor.r += -interval;
        else if (this.monColor.r < 50) this.monColor.r += interval;
        if (this.monColor.g > 100) this.monColor.g += -interval;
        else if (this.monColor.g < 100) this.monColor.g += interval;
        if (this.monColor.b < 255) this.monColor.b += interval;

        if (this.secColor.r > 50) this.secColor.r += -interval;
        else if (this.secColor.r < 50) this.secColor.r += interval;
        if (this.secColor.g > 100) this.secColor.g += -interval;
        else if (this.secColor.g < 100) this.secColor.g += interval;
        if (this.secColor.b < 255) this.secColor.b += interval;
    }

    updateColorAndMetrics(ns: NS,dt:number) {
        if (!(this.timer <= 0)) Math.max(0,this.timer += -dt);
        else {
            const action = this.action(ns);
            const inPort = ns.getPortHandle(this.inPort)
            if (inPort.peek() !== "NULL PORT DATA") {
                if (inPort.read() === "RESET") {
                    this.setTimer(ns,action.toLowerCase())
                }
            }   
        }
        const currMoney = this.server.moneyAvailable ?? 0;
        if (currMoney != this.lastMon) {
            if (currMoney > this.lastMon) {
                this.monColor = { r: 0, g: 250, b: 5 };
                this.lastMon = currMoney;
            } else if (currMoney < this.lastMon) {
                this.monColor = { r: 250, g: 0, b: 5 };
                this.lastMon = currMoney;
            }
        }
        const currSec = this.server.hackDifficulty ?? 0;
        if (currSec != this.lastSec) {
            if (currSec > this.lastSec) {
                this.secColor = { r: 250, g: 0, b: 0 };
                this.lastSec = currSec;
            } else if (currSec < this.lastSec) {
                this.secColor = { r: 0, g: 250, b: 0 };
                this.lastSec = currSec;
            }
        }
        const action = this.action(ns);
        switch (action) {
            case "Weakening": return this.actColor = { r: 255, g: 100, b: 255 };
            case "Growing": return this.actColor = { r: 0, g: 255, b: 255 };
            case "Hacking": return this.actColor = { r: 100, g: 255, b: 100 };
            case "Sharing": return this.actColor = { r: 0, g: 100, b: 255 };
            default: return this.actColor = { r: 255, g: 255, b: 0 }
        }
    }

    refreshServer(ns: NS) {
        this.server = ns.getServer(this.server.hostname);
    }


    hasRoot(): boolean {
        return this.server.hasAdminRights;
    }
    
    growTime(ns:NS):number {
        

        return ns.getGrowTime(this.server.hostname);
    }

    weakTime(ns:NS):number {
        return ns.getWeakenTime(this.server.hostname);
    }

    hackTime(ns:NS):number {
        return ns.getHackTime(this.server.hostname);
    }

    timeDown(dt:number) {
        if (this.timer <= 0) return;
        this.timer += -dt;
    }

    canRoot(ns: NS): boolean {
        const reqHack = this.server.requiredHackingSkill ?? 0;
        if (reqHack <= ns.getHackingLevel()) return true;
        return false
    }

    getRoot(ns: NS): boolean {
        if (!this.canRoot(ns)) return false;
        const reqPorts = this.server.numOpenPortsRequired ?? 0
        if (this._numPortsCanOpen(ns) >= reqPorts) {
            if (this._crackPorts(ns) >= reqPorts && ns.nuke(this.server.hostname)) return true;
        }
        return false;
    }

    _crackPorts(ns: NS): number {
        const actions = [
            ns.brutessh,
            ns.ftpcrack,
            ns.relaysmtp,
            ns.httpworm,
            ns.sqlinject
        ]
        let openPorts = 0
        for (const action of actions) {
            if (!action(this.server.hostname)) break;
            openPorts++;
        }
        return openPorts;
    }

    _numPortsCanOpen(ns: NS): number {
        let possible: number = 0;
        const progs = [
            "BruteSSH.exe",
            "FTPCrack.exe",
            "relaySMTP.exe",
            "HTTPWorm.exe",
            "SQLInject.exe"
        ];
        for (const prog of progs) {
            if (ns.fileExists(prog, "home")) possible++;
        }
        return possible;
    }

    action(ns: NS): string {
        let output = "Waiting";
        const procs = ns.ps(this.server.hostname)
        if (procs.length > 0) {
            for (const proc of procs) {
                if (proc.filename.includes("weak")) output = "Weakening";
                else if (proc.filename.includes("grow")) output = "Growing";
                else if (proc.filename.includes("hack")) output = "Hacking";
                else if (proc.filename.includes("share")) output = "Sharing";
            }
        } else if (this.server.maxRam == 0){
            output = "NO RAM";
        }
        return output;
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

    _calculateThreads(ns: NS, script: string): number {
        const freeRam = this.server.maxRam - this.server.ramUsed;
        const scriptRam = ns.getScriptRam(script);
        return Math.max(0, Math.floor(freeRam / scriptRam));
    }

    killOld(ns: NS): boolean {
        const old = ns.ps(this.server.hostname);
        if (old.length > 0) {
            for (const proc of old) {
                return ns.kill(proc.pid);
            }
        }
        return false;
    }

    shouldAction(ns: NS): string {
        const minSec = this.server.minDifficulty ?? 0;
        const currSec = this.server.hackDifficulty ?? 0;
        const secTresh = minSec * 1.2;
        const maxMoney = this.server.moneyMax ?? 0;
        const currMoney = this.server.moneyAvailable ?? 0;
        const moneyThresh = maxMoney / 10;
        const currentAction = this.action(ns);
        if (minSec === 0 || currSec === 0 || maxMoney === 0 || currMoney === 0) {
            if (currentAction !== "Sharing") return "SHARE";
        }

        switch (true) {
            case currentAction === "Waiting":
                break;

            case currentAction === "Hacking":
                return "SEND_H";

            case currentAction === "Weakening":
                return "SEND_W";

            case currentAction === "Growing":
                return "SEND_G";
        }

        switch (true) {
            case currentAction !== "Waiting":
                break;

            case currSec > secTresh:
                return "WEAK";

            case currMoney < moneyThresh:
                this.keepGrowing = true;
                return "GROW";

            case currMoney === maxMoney:
                this.keepGrowing = false;
                return "HACK";

            case this.keepGrowing:
                return "GROW";

            default:
                return "HACK";
        }
        return "N/A"
    }

    sendInfo(ns: NS): boolean {
        const outPort = ns.getPortHandle(this.outPort)
        const threshSec = (this.server.minDifficulty as number) * 1.2;
        const currSec = (this.server.hackDifficulty as number);
        const currMoney = this.server.moneyAvailable as number;
        const maxMoney = this.server.moneyMax as number;
        const threshMoney = (this.server.moneyMax as number) / 10;
        const minSec = this.server.minDifficulty as number;
        const info = [threshSec, currSec, minSec, currMoney, maxMoney, threshMoney];

        if (outPort.peek() === "NULL PORT DATA") outPort.write(info);
        else {
            const old = outPort.peek()
            for (let x = 0; x < info.length; x++) {
                if (old[x] !== info[x]) {
                    outPort.clear();
                    outPort.write(info);
                    break;
                }
            }
        }
        return true;
    }

    setTimer(ns:NS,payload:string) {
        if (this.timer <= 0) {
            if (payload.includes("weak")) this.timer = this.weakTime(ns);
            else if (payload.includes("hack")) this.timer = this.hackTime(ns);
            else if (payload.includes("grow")) this.timer = this.growTime(ns);
        }
    }

    doAction(ns: NS, payload: string): boolean {
        const srcFile = "/unBasic" + payload
        if (ns.ps(this.server.hostname).length > 0 && !this.killOld(ns)) return false;
        const threads = this._calculateThreads(ns, srcFile);
        if (!isFinite(threads) || threads === 0) return false;
        const t = this.server.hostname;
        if (!ns.exec(payload, t, threads, this.outPort,this.inPort)) {
            // this.error = `in doAction(ns,${payload}}): Cannot execute files. Reason unknown. Analyze server?`
            return false;
        }
        this.setTimer(ns,payload)
        return true;
    }

    runSelf(ns: NS): boolean {
        if (this.server.hostname === "home") return false;
        this.refreshServer(ns)

        if (!this.hasRoot()) {
            if (this.canRoot(ns)) {
                if (!this.getRoot(ns)) {
                    return false;
                }
            } else {
                return false;
            }
        }

        if (!this.sendFiles(ns)) {
            return false;
        }

        const shouldDo = this.shouldAction(ns);
        switch (shouldDo) {
            case "WEAK": return this.doAction(ns, "/payload/weaken.ts");
            case "GROW": return this.doAction(ns, "/payload/grow.ts");
            case "HACK": return this.doAction(ns, "/payload/hack.ts");
            case "SHARE": return this.doAction(ns, "/payload/share.ts");
            case "SEND_H":
            case "SEND_G":
            case "SEND_W":
                return this.sendInfo(ns)
            case "N/A":
            default:
                return false;
        }
        
    }


    output(ns: NS,dt:number): string {
        let output: string = ""
        let currSec: number
        let minSec: number
        let maxMoney: number
        let currMoney: number
        let name = this.server.hostname
        if (name.length > 8) name = name.slice(0, 5) + "...";
        this.updateColorAndMetrics(ns,dt);

        output += colorize(`[${name}]: `, this.servColor.r, this.servColor.g, this.servColor.b)
        if (this.hasRoot()) {

            if (this.server.moneyMax && this.server.moneyAvailable) {
                maxMoney = this.server.moneyMax as number;
                currMoney = this.server.moneyAvailable as number;
                output += colorize(`$${ns.format.number(currMoney, 2)}/$${ns.format.number(maxMoney,2)} | `, this.monColor.r, this.monColor.g, this.monColor.b);
            }

            if (this.server.minDifficulty && this.server.hackDifficulty) {
                currSec = this.server.hackDifficulty as number;
                minSec = this.server.minDifficulty as number;
                output += colorize(`${ns.format.number(minSec,1)}/${ns.format.number(currSec,1)} | `, this.secColor.r, this.secColor.g, this.secColor.b)
            }

            if (this.error) {
                output += ` ${colorize(String(this.error),255,75,75)}`;
                return output;
            }
            
            let actionTime = ns.format.time(this.timer)
            if (actionTime.includes("minutes")) actionTime = actionTime.replace("inutes","");
            else if (actionTime.includes("minute")) actionTime = actionTime.replace("inute","");
            if (actionTime.includes("seconds")) actionTime = actionTime.replace("econds","");
            else if (actionTime.includes("second")) actionTime = actionTime.replace("econd","s");
            actionTime = actionTime.replaceAll(" ", "")
            output += colorize(`${this.action(ns)} ${actionTime}`, this.actColor.r, this.actColor.g, this.actColor.b)

        } else {

            if (this.server.requiredHackingSkill) {
                const reqHackLV = this.server.requiredHackingSkill
                if (!this.canRoot(ns)) output += `${colorize(String(reqHackLV), 255, 255, 0)}`;
                else output += `${colorize(String(reqHackLV), 0, 255, 0)}`
            }

        }
        if (this.server.purchasedByPlayer || !this.hasRoot()) return output;
        
        const bd = this.server.backdoorInstalled && this.server.backdoorInstalled
        let obd = `${colorize("false", 255, 0, 0)}`
        if (bd === true) obd = `${colorize("true", 0, 255, 0)}`;
        output += `${colorize(" | bd?:", this.servColor.r, this.servColor.g, this.servColor.b)}${obd}`;
        return output;
    }
}

export function bDoorWrite(ns: NS, servers: ScannedServer[]) {
    if (!ns.fileExists("backdoors.txt")) ns.write("backdoors.txt");
    let fileContent: string = ""
    for (const server of servers) {
        if (server.server.hostname === "home") continue;
        if (!server.hasRoot() || server.server.purchasedByPlayer) continue;
        if (!server.server.backdoorInstalled) fileContent += `${server.path.join(";connect ")}; backdoor\n`
    }
    if (fileContent !== ns.read("backdoors.txt")) ns.write("backdoors.txt", fileContent, "w")
}