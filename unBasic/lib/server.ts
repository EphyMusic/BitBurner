import { NS, Server } from "@ns";
import { colorize } from "./common";

export class ScannedServer {
    server: Server;
    path: string[];
    timeActive = 0;
    state: string;
    weakening: boolean;
    lastSec: number;
    lastMon: number;
    resetPort: number;
    monColor: { r: number; g: number; b: number };
    secColor: { r: number; g: number; b: number };
    servColor: { r: number; g: number; b: number };
    actColor: { r: number; g: number; b: number };
    timer = 0;
    error: string | null = null;

    constructor(ns: NS, hostname: string, path: string[], port: number) {
        this.server = ns.getServer(hostname);
        this.path = path;
        this.resetPort = port;
        this.state = "UNASSIGNED";
        this.initState(ns);
        this.weakening = false;
        this.lastSec = this.server.hackDifficulty ?? 0;
        this.lastMon = this.server.moneyAvailable ?? 0;
        this.monColor = { r: 50, g: 100, b: 255 };
        this.secColor = { r: 50, g: 100, b: 255 };
        const sB = Math.random() * 255;
        this.servColor = { r: 150, g: 255, b: sB };
        this.actColor = { r: 255, g: 255, b: 255 };
    }

    growTime(ns: NS): number {
        return ns.getGrowTime(this.server.hostname);
    }

    weakTime(ns: NS): number {
        return ns.getWeakenTime(this.server.hostname);
    }

    hackTime(ns: NS): number {
        return ns.getHackTime(this.server.hostname);
    }

    timeDown(dt: number) {
        if (this.timer <= 0) return;
        this.timer = Math.max(this.timer - dt, 0);
    }

    setTimer(ns: NS, payload: string, reset = false) {
        if (this.timer <= 0 || reset) {
            if (payload.includes("weak")) this.timer = this.weakTime(ns);
            else if (payload.includes("hack")) this.timer = this.hackTime(ns);
            else if (payload.includes("grow")) this.timer = this.growTime(ns);
        }
    }

    normalizeColor() {
        const interval = 10;
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

    updateColorAndMetrics(ns: NS, dt: number) {
        const action = this.weakening ? "WEAK" : this.state;
        const resetPort = ns.getPortHandle(this.resetPort);
        if (this.timer > 0) {
            this.timeDown(dt);
        } else if (resetPort.peek() !== "NULL PORT DATA" && resetPort.read() === "RESET") {
                this.setTimer(ns, action.toLowerCase(), true);
        }

        const currMoney = this.server.moneyAvailable ?? 0;
        if (currMoney !== this.lastMon) {
            if (currMoney > this.lastMon) {
                this.monColor = { r: 0, g: 250, b: 5 };
                this.lastMon = currMoney;
            } else if (currMoney < this.lastMon) {
                this.monColor = { r: 250, g: 0, b: 5 };
                this.lastMon = currMoney;
            }
        }

        const currSec = this.server.hackDifficulty ?? 0;
        if (currSec !== this.lastSec) {
            if (currSec > this.lastSec) {
                this.secColor = { r: 250, g: 0, b: 0 };
                this.lastSec = currSec;
            } else if (currSec < this.lastSec) {
                this.secColor = { r: 0, g: 250, b: 0 };
                this.lastSec = currSec;
            }
        }


        switch (action) {
            case "WEAK":
                this.actColor = { r: 255, g: 100, b: 255 };
                return;
            case "HACK":
                this.actColor = { r: 0, g: 255, b: 255 };
                return;
            case "GROW":
                this.actColor = { r: 100, g: 255, b: 100 };
                return;
            case "SHARE":
                this.actColor = { r: 0, g: 100, b: 255 };
                return;
            default:
                this.actColor = { r: 255, g: 255, b: 0 };
        }
    }

    refreshServer(ns: NS) {
        this.server = ns.getServer(this.server.hostname);
    }

    canRoot(ns: NS): boolean {
        const reqHack = this.server.requiredHackingSkill ?? 0;
        return reqHack <= ns.getHackingLevel();
    }

    getRoot(ns: NS): boolean {
        if (!this.canRoot(ns)) return false;
        const reqPorts = this.server.numOpenPortsRequired ?? 0;
        if (this._numPortsCanOpen(ns) >= reqPorts) {
            return this._crackPorts(ns) >= reqPorts && ns.nuke(this.server.hostname);
        }
        return false;
    }

    _crackPorts(ns: NS): number {
        const actions = [ns.brutessh, ns.ftpcrack, ns.relaysmtp, ns.httpworm, ns.sqlinject];
        let openPorts = 0;
        for (const action of actions) {
            if (!action(this.server.hostname)) break;
            openPorts++;
        }
        return openPorts;
    }

    _numPortsCanOpen(ns: NS): number {
        let possible = 0;
        const progs = ["BruteSSH.exe", "FTPCrack.exe", "relaySMTP.exe", "HTTPWorm.exe", "SQLInject.exe"];
        for (const prog of progs) {
            if (ns.fileExists(prog, "home")) possible++;
        }
        return possible;
    }

    _calculateThreads(ns: NS, script: string): number {
        const freeRam = this.server.maxRam - this.server.ramUsed;
        const scriptRam = ns.getScriptRam(script);
        return Math.max(0, Math.floor(freeRam / scriptRam));
    }

    killOld(ns: NS): boolean {
        const old = ns.ps(this.server.hostname);
        if (old.length > 0) {
            const res: boolean[] = [];
            for (const proc of old) {
                res.push(ns.kill(proc.pid));
            }
            for (const result of res) {
                if (!result) return false;
            }
            return true;
        }
        return true;
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
            const finalFile = file.replace("/unBasic", "");
            if (!ns.fileExists(file, "home")) return false;
            if (!ns.scp(file, target, "home")) return false;
            ns.mv(target, file, finalFile);
        }
        return true;
    }

    doAction(ns: NS, payload: string): boolean {
        const srcFile = "/unBasic" + payload;
        if (this.alreadyRunning(ns, payload)) return false;
        if (ns.ps(this.server.hostname).length > 0 && !this.killOld(ns)) return false;
        const threads = this._calculateThreads(ns, srcFile);
        if (!isFinite(threads) || threads === 0) return false;
        const target = this.server.hostname;
        if (!ns.exec(payload, target, threads, this.resetPort)) return false;
        this.setTimer(ns, payload, true);
        return true;
    }

    alreadyRunning(ns: NS, payload: string): boolean {
        const procs = ns.ps(this.server.hostname);
        if (procs.length > 0) {
            for (const proc of procs) {
                if (`/${proc.filename}` === `${payload}`) {
                    return true;
                }
            }
        }
        return false;
    }

    initState(ns: NS) {
        if (!this.server.hasAdminRights) {
            this.state = "ROOT";
        } else if (!this.server.moneyMax || this.server.moneyMax === 0) {
            this.state = "SHARE";
        } else {
            const money = this.server.moneyAvailable as number;
            const maxMoney = this.server.moneyMax as number;
            const moneyThresh = maxMoney / 10;
            if (money < moneyThresh) {
                this.state = "GROW";
            } else {
                this.state = "HACK";
            }
        }
    }

    runSelf(ns: NS): undefined | boolean {
        this.refreshServer(ns);
        if (!this.sendFiles(ns)) {
            this.error = "Cannot send files...";
            return;
        }
        this.runState(ns);
        return;
    }

    action(ns: NS): string {
        let output = "Waiting";
        const procs = ns.ps(this.server.hostname);
        if (procs.length > 0) {
            for (const proc of procs) {
                if (proc.filename.includes("weak")) output = "Weakening";
                else if (proc.filename.includes("grow")) output = "Growing";
                else if (proc.filename.includes("hack")) output = "Hacking";
                else if (proc.filename.includes("share")) output = "Sharing";
            }
        } else if (this.server.maxRam === 0) {
            output = "NO RAM";
        }
        return output;
    }

    runState(ns: NS) {
        const currentMoney = this.server.moneyAvailable as number;
        const currentSecurity = this.server.hackDifficulty as number;
        const maxMoney = this.server.moneyMax as number;
        const minimumSecurity = this.server.minDifficulty as number;

        switch (this.state) {
            case "GROW":
                if (this.weakening) {
                    if (currentSecurity !== minimumSecurity) {
                        if (this.alreadyRunning(ns, "/payload/weaken.ts")) return;
                        this.doAction(ns, "/payload/weaken.ts");
                        return;
                    }
                    this.weakening = false;
                    return;
                }

                if (currentMoney !== maxMoney) {
                    if (!(currentSecurity > minimumSecurity * 1.2)) {
                        if (this.alreadyRunning(ns, "/payload/grow.ts")) return;
                        this.doAction(ns, "/payload/grow.ts");
                        return;
                    }
                    this.weakening = true;
                    return;
                }

                this.state = "HACK";
                return;

            case "HACK":
                if (this.weakening) {
                    if (currentSecurity !== minimumSecurity) {
                        if (this.alreadyRunning(ns, "/payload/weaken.ts")) return;
                        this.doAction(ns, "/payload/weaken.ts");
                        return;
                    }
                    this.weakening = false;
                    return;
                }

                if (!(currentMoney < maxMoney / 10)) {
                    if (!(currentSecurity > minimumSecurity * 1.2)) {
                        if (this.alreadyRunning(ns, "/payload/hack.ts")) return;
                        this.doAction(ns, "/payload/hack.ts");
                        return;
                    }
                    this.weakening = true;
                    return;
                }

                this.state = "GROW";
                return;

            case "ROOT":
                if (this.canRoot(ns) && this.getRoot(ns)) {
                    this.state = "INIT";
                }
                return;

            case "INIT":
                this.initState(ns);
                return;

            case "SHARE":
                this.runShare(ns);
                return;

            default:
                return;
        }
    }

    runShare(ns: NS) {
        if (this.alreadyRunning(ns, "/payload/share.ts")) return;
        this.doAction(ns, "/payload/share.ts");
    }

    output(ns: NS, dt: number): string {
        let output = "";
        let currSec: number;
        let minSec: number;
        let maxMoney: number;
        let currMoney: number;
        let name = this.server.hostname;
        if (name.length > 8) name = name.slice(0, 5) + "...";

        let action = "Waiting";
        const procs = ns.ps(this.server.hostname);
        if (procs.length > 0) {
            for (const proc of procs) {
                if (proc.filename.includes("weak")) action = "Weakening";
                else if (proc.filename.includes("hack")) action = "Hacking";
                else if (proc.filename.includes("grow")) action = "Growing";
                else if (proc.filename.includes("share")) action = "Sharing";
            }
        }

        this.updateColorAndMetrics(ns, dt);

        output += colorize(`[${name}]: `, this.servColor.r, this.servColor.g, this.servColor.b);
        if (this.server.hasAdminRights) {
            if (this.server.moneyMax && this.server.moneyAvailable) {
                maxMoney = this.server.moneyMax as number;
                currMoney = this.server.moneyAvailable as number;
                output += colorize(`$${ns.format.number(currMoney, 2)}/$${ns.format.number(maxMoney, 2)} | `, this.monColor.r, this.monColor.g, this.monColor.b);
            }

            if (this.server.minDifficulty && this.server.hackDifficulty) {
                currSec = this.server.hackDifficulty as number;
                minSec = this.server.minDifficulty as number;
                output += colorize(`${ns.format.number(minSec, 1)}/${ns.format.number(currSec, 1)} | `, this.secColor.r, this.secColor.g, this.secColor.b);
            }

            if (this.error) {
                output += ` ${colorize(String(this.error), 255, 75, 75)}`;
                return output;
            }

            if (action !== "Sharing" && action !== "Waiting") {
                let actionTime = ns.format.time(this.timer);
                if (actionTime.includes("minutes")) actionTime = actionTime.replace("minutes", "m");
                else if (actionTime.includes("minute")) actionTime = actionTime.replace("minute", "m");
                if (actionTime.includes("seconds")) actionTime = actionTime.replace("seconds", "s");
                else if (actionTime.includes("second")) actionTime = actionTime.replace("second", "s");
                actionTime = actionTime.replaceAll(" ", "");
                output += colorize(`${this.state}|${action}: ${actionTime}`, this.actColor.r, this.actColor.g, this.actColor.b);
            } else {
                output += colorize(action, this.actColor.r, this.actColor.g, this.actColor.b);
            }
        } else if (this.server.requiredHackingSkill) {
            const reqHackLV = this.server.requiredHackingSkill;
            if (!this.canRoot(ns)) output += `${colorize(String(reqHackLV), 255, 255, 0)}`;
            else output += `${colorize(String(reqHackLV), 0, 255, 0)}`;
        }

        if (this.server.purchasedByPlayer || !this.server.hasAdminRights) return output;

        const bd = this.server.backdoorInstalled && this.server.backdoorInstalled;
        let obd = `${colorize("false", 255, 0, 0)}`;
        if (bd === true) obd = `${colorize("true", 0, 255, 0)}`;
        output += `${colorize(" | bd?:", this.servColor.r, this.servColor.g, this.servColor.b)}${obd}`;
        return output;
    }
}

export function bDoorWrite(ns: NS, servers: ScannedServer[]) {
    if (!ns.fileExists("backdoors.txt")) ns.write("backdoors.txt");
    let fileContent = "";
    for (const server of servers) {
        if (server.server.hostname === "home") continue;
        if (!server.server.hasAdminRights || server.server.purchasedByPlayer) continue;
        if (!server.server.backdoorInstalled) fileContent += `${server.path.join(";connect ")}; backdoor\n`;
    }
    if (fileContent !== ns.read("backdoors.txt")) ns.write("backdoors.txt", fileContent, "w");
}
