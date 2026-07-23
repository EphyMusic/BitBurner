//import {NS,Server} from "@ns"

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

// Startup and Shutdown
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
    //ns.atExit(() => exitTasks(ns));
}

function exitTasks(ns:NS) {
    const servers = scan(ns,"home");
    ns.ui.closeTail()
    for (const s of servers) {
        if (s.server.hostname == "home") continue;
        ns.tprint(`Killing scripts on ${s.server.hostname}`);
        const procs = ns.ps(s.server.hostname);
        if (procs.length > 0) {
            for (const proc of procs) {
                ns.kill(proc.pid)
            }
        }
    }
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

	getRoot(ns:NS):boolean {
        if (!this.canRoot(ns)) return false;
        const reqPorts = this.server.numOpenPortsRequired ?? 0
        if (this._numPortsCanOpen(ns) >= reqPorts ) {
            if (this._crackPorts(ns) >= reqPorts && ns.nuke(this.server.hostname)) return true;
        }
		return false;
	}

    _crackPorts(ns:NS):number {
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
            openPorts++
        }
        return openPorts;
    }

	_numPortsCanOpen(ns:NS):number {
        let possible:number = 0;
        const progs = [
            "BruteSSH.exe",
            "FTPCrack.exe",
            "relaySMTP.exe",
            "HTTPWorm.exe",
            "SQLInject.exe"
        ];
        for (const prog of progs) {
            if (ns.fileExists(prog,"home")) possible ++;
        }
		return possible;
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
        const pWeaken = "/payload/weaken.ts";
        const pGrow = "/payload/grow.ts";
        const pHack = "/payload/hack.ts";
        const target = this.server.hostname;

        if (ns.fileExists(pWeaken,target) && ns.fileExists(pGrow,target) && ns.fileExists(pHack,target)) return true;
        if (!ns.fileExists(pWeaken,"home") || !ns.fileExists(pGrow,"home") || !ns.fileExists(pHack,"home")) return false;
        if (!ns.scp(pWeaken,target,"home") || !ns.scp(pGrow,target,"home") || !ns.scp(pHack,target,"home")) return false;
        return true;
    }

    _calculateThreads(ns:NS,script:string):number {
        this.refreshServer(ns);
        const freeRam = this.server.maxRam - this.server.ramUsed;
        const scriptRam = ns.getScriptRam(script);
        return Math.floor(freeRam / scriptRam);
    }

    killOld(ns:NS) {
        const old = ns.ps(this.server.hostname);
        if (old.length > 0) {
            for (const proc of old) {
                ns.kill(proc.pid);
            }
        }
    }

    weakenSelf(ns:NS):boolean {
        this.killOld(ns)
        const threads = this._calculateThreads(ns,"/payload/weaken.ts")
        if (!ns.exec("/payload/weaken.ts",this.server.hostname,threads)) return false;
        return true;
    }

    growSelf(ns:NS):boolean {
        this.killOld(ns)
        const threads = this._calculateThreads(ns,"payload/grow.ts");
        if (!ns.exec("/payload/weaken.ts", this.server.hostname,threads)) return false;
        return true;

    }

    hackSelf(ns:NS):boolean {
        this.killOld(ns)
        const threads = this._calculateThreads(ns,"payload/hack.ts");
        if (!ns.exec("/payload/hack.ts",this.server.hostname,threads)) return false;
        return true;
    }

    runSelf(ns:NS):boolean {
        if (this.server.hostname === "home") return false;
        this.refreshServer(ns)
        //If we don't have root, we should try to get root. If we do have root, then we should do all the root things.
		if (!this.hasRoot(ns)) {
            // ns.tprint(`No root on ${this.server.hostname}`)
            if (this.canRoot(ns)) {
                // ns.tprint(`Can root on ${this.server.hostname}`)
			    if (!this.getRoot(ns)) {
                    // ns.tprint(`could not get root on ${this.server.hostname}`)
                };
            } else {
                // ns.tprint(`Cannot root on ${this.server.hostname}`)
                return false;
            }
        }

        // ns.tprint(`Have root on ${this.server.hostname}`)
        if (!this.sendFiles(ns)) {
            // ns.tprint(`Could not send files to ${this.server.hostname}` )
            return false;
            }
        // ns.tprint(`Files sent/already present on ${this.server.hostname}`)
        if (this.action(ns) !== "Weakening..." && this.shouldWeaken(ns)) {
            // ns.tprint(`Weakening ${this.server.hostname}`)
            return this.weakenSelf(ns);
        } else if (this.action(ns) !== "Growing..." && this.shouldGrow(ns)) {
            // ns.tprint(`Growing ${this.server.hostname}`)
            return this.growSelf(ns);
        } else if (this.action(ns) !== "Hacking..."){
            // ns.tprint(`Hacking ${this.server.hostname}`)
            return this.hackSelf(ns);
        }
        // ns.tprint(`Nothing to do on ${this.server.hostname}`)
        return true;
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

function scan(ns: NS, start = "home"): ScannedServer[] {
	const visited = new Map<string, { sName: string; path: string[] }>();

	function dfs(host: string, path: string[] = []) {
		const fullPath = [...path, host];
		visited.set(host, { sName: host, path: fullPath });

		for (const next of ns.scan(host)) {
			if (!visited.has(next)) {
				dfs(next, fullPath);
			}
		}
	}

	dfs(start);

	const servers: ScannedServer[] = [];
    let port = 0
	for (const s of visited.keys()) {
		const entry = visited.get(s)!;
        if (entry.sName == "home") continue;
		servers.push(new ScannedServer(ns,entry.sName,entry.path,port))
        port ++
	}
	return servers;
}

function display(ns:NS,servers:ScannedServer[],startTime:number) {
    const root:string[] = [];
    const unroot:string[] = [];

    for (const server of servers) {
        if (server.hasRoot(ns)) {
            root.push(server.display(ns));
        } else {
            unroot.push(server.display(ns));
        }
    }

    const rootGroups = makeGroup(root);
    const unrootGroups = makeGroup(unroot);
    ns.print("Root")
    const rGroupSel:number = Math.floor((Date.now() / 2000 - startTime) % rootGroups.length);
    ns.tprint(rootGroups.length)
    exitTasks(ns); //remove
    for (const s of rootGroups[rGroupSel]) {
		ns.print(`${s}\n`)
	}
    ns.print("Unroot")
	const unGroupSel:number = Math.floor((Date.now() / 2000 - startTime) % unrootGroups.length);
	for (const s of unrootGroups[unGroupSel]) {
		ns.print(`${s}\n`);
	}
}

function makeGroup(servers:string[]):string[][] {
	const fullGroup:string[][] = []
	let group:string[] = []
	let x = 0;
	for (const s of servers) {
		if (x >= 5) {
			x = 0;
			fullGroup.push(group);
			group = [];
		}
		group.push(s);
		x += 1;
	}
	fullGroup.push(group);
	return fullGroup;
}

export async function main(ns:NS) {
    const startTime = Date.now()
    initTail(ns,"Basic", 500, 500, 12)
    // ns.tprint("tail started")
    const servers = scan(ns,"home")
    // ns.tprint("servers created")
    // ns.tprint(`${servers.length} Servers`)
    while (true) {
        ns.clearLog()
        // ns.tprint("beginning")
        for (const server of servers) {
            server.runSelf(ns)
        }
        display(ns,servers,startTime)
        // ns.tprint("finishing")
        ns.ui.renderTail()
        await ns.sleep(10)
    }
    // ns.tprint("something is wrong.")
}
