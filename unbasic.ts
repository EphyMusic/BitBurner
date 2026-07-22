import {NS,Server} from "@ns"

//Color utils
export function colorize(text: string, r: number, g: number, b: number) {
    return `${rgbToAnsiFg(r, g, b)}${text}${ANSI.reset}`;
}

export function colorizeBg(text: string, bgR: number, bgG: number, bgB: number, fgR: number = 255, fgG: number = 255, fgB: number = 255) {
    return `${rgbToAnsiBg(bgR, bgG, bgB)}${rgbToAnsiFg(fgR, fgG, fgB)}${text}${ANSI.reset}`;
}

export function tag(text: string, bgR: number, bgG: number, bgB: number, fgR: number = 0, fgG: number = 0, fgB: number = 0) {
    return colorizeBg(` ${text} `, bgR, bgG, bgB, fgR, fgG, fgB);
}

const ANSI = {
    reset: "\x1b[0m",
    fgRgb: (r: number, g: number, b: number) => `\x1b[38;2;${r};${g};${b}m`,
    bgRgb: (r: number, g: number, b: number) => `\x1b[48;2;${r};${g};${b}m`,
};

function clampByte(n: number) {
    return Math.max(0, Math.min(255, Math.round(n)));
}

function rgbToAnsiFg(r: number, g: number, b: number) {
    return ANSI.fgRgb(clampByte(r), clampByte(g), clampByte(b));
}

function rgbToAnsiBg(r: number, g: number, b: number) {
    return ANSI.bgRgb(clampByte(r), clampByte(g), clampByte(b));
}

export async function initTail(ns: NS,title: string,width: number,height: number,fontSize: number) {
    ns.disableLog("ALL");
    ns.ui.openTail();
    // await boot(ns);
    ns.ui.setTailTitle(title ?? "Test");
    const[x,y] = ns.ui.windowSize();
    ns.ui.resizeTail(width ?? x/7,height ?? y/7);
    ns.ui.setTailFontSize(fontSize??14);
    ns.ui.moveTail(x-width,0);
    ns.ui.renderTail();
    ns.atExit(ns.ui.closeTail);
}

//Server Class
class ScannedServer {
    server: Server;
    path: string[];
    port: number;

    constructor(ns:NS,name:string,path:string[],port:number) {
        this.server = ns.getServer(name);
        this.path = path;
        this.port = port;
    }

    refreshServer(ns:NS) {
        this.server = ns.getServer(this.server.hostname);
    }

    shouldWeaken(ns:NS):boolean {
        this.refreshServer(ns)
        const minSec = this.server.minDifficulty ?? 0;
        const currSec = this.server.hackDifficulty ?? 0;
        if (minSec === 0) return false;
        if (currSec > (minSec * 0.2) + minSec) return true;
        return false;
    }

    shouldGrow(ns:NS):boolean {
        this.refreshServer(ns)
        const maxMoney = this.server.moneyMax ?? 0;
        const currMoney = this.server.moneyAvailable?? 0;
        if (maxMoney === 0) return false;
        if (currMoney > maxMoney / 10) return true;
        return false;
    }

    hasRoot(ns:NS):boolean {
        this.refreshServer(ns);
        return this.server.hasAdminRights;
    }

    canRoot(ns:NS):boolean {
        this.refreshServer(ns)
        const reqHack = this.server.requiredHackingSkill ?? 0;
        if (reqHack <= ns.getHackingLevel()) return true;
        return false
    }

    action(ns:NS):string {
        let output = "Waiting...";
        const procs = ns.ps(this.server.hostname)
        if (procs.length > 0) {
            for (const proc of procs) {
                if (proc.filename.includes("weak")) output = "Weakening...";
                else if (proc.filename.includes("grow")) output = "Growing...";
                else if (proc.filename.includes("hack")) output = "Hacking...";
            }
        }
        return output;
    }

    sendFiles(ns:NS):boolean {
        const pWeaken = "/payload/weaken.ts"
        const pGrow = "/payload/grow.ts"
        const pHack = "/payload/hack.ts"
        const target = this.server.hostname;

        if (ns.fileExists(pWeaken,target) && ns.fileExists(pGrow,target) && ns.fileExists(pHack,target)) return true;
        if (!ns.fileExists(pWeaken,"home") || !ns.fileExists(pGrow,"home") || !ns.fileExists(pHack,"home")) return false;
        if (!ns.scp(pWeaken,target,"home") || !ns.scp(pGrow,target,"home") || !ns.scp(pHack,target,"home")) return false;
        return true;
    }

    run(ns:NS):void {
        this.refreshServer(ns)
        //If we don't have root, we should try to get root. If we do have root, then we should do all the root things.
    }

    display(ns:NS):string {
        let output:string = ""
        let currSec:number
        let minSec:number
        let maxMoney:number
        let currMoney:number
        let name = this.server.hostname
        if (name.length >= 6) name = name.slice(0,6) + "...";

        output += `[${name}]: `
        if (this.hasRoot(ns)) {
            if (this.server.moneyMax && this.server.moneyAvailable) {
                maxMoney = this.server.moneyMax as number;
                currMoney = this.server.moneyAvailable as number;
                output += `$${ns.format.number(currMoney,2)}/$${ns.format.number(maxMoney)} | `
            }
            if (this.server.minDifficulty && this.server.hackDifficulty) {
                currSec = this.server.hackDifficulty as number;
                minSec = this.server.minDifficulty as number;
                output += `${ns.format.number(minSec)}/${ns.format.number(currSec)} | `
            }
            output += `${this.action(ns)}`
        } else {
            if (this.server.requiredHackingSkill) {
                const reqHackLV = this.server.requiredHackingSkill 
                if (!this.canRoot(ns)) output += `${colorize(String(reqHackLV),255,255,0)}`;
                else output += `${colorize(String(reqHackLV),0,255,0)}`
            }
        }
        const bd = this.server.backdoorInstalled && this.server.backdoorInstalled
        let obd = `${colorize("false",255,0,0)}`
        if (bd === true ) obd = `${colorize("true",0,255,0)}`;
        output += ` | bd?:${obd}`
        return output;
    }
}
