// import {NS,Server} from "@ns"

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

type SpinnerInfo = {
    spinner:string[]
    r:number
    g:number
    b:number
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
    ns.atExit(() => exitTasks(ns));
}

function exitTasks(ns:NS) {
    const servers = scan(ns,"home");
    ns.ui.closeTail()
    for (const s of servers) {
        if (s.server.hostname == "home") continue;
        const procs = ns.ps(s.server.hostname);
        if (procs.length > 0) {
            ns.tprint(`Killing scripts on ${s.server.hostname}`);
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
    timeActive:number = 0

    constructor(ns:NS,name:string,path:string[],port:number) {
        this.server = ns.getServer(name);
        this.path = path;
        this.port = port;
    }
    
    refreshServer(ns:NS) {
        this.server = ns.getServer(this.server.hostname);
    }
    
    
    hasRoot(ns:NS):boolean {
        return this.server.hasAdminRights;
    }
    
    canRoot(ns:NS):boolean {
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
        let output = "Waiting";
        const procs = ns.ps(this.server.hostname)
        if (procs.length > 0) {
            for (const proc of procs) {
                if (proc.filename.includes("weak")) output = "Weakening";
                else if (proc.filename.includes("grow")) output = "Growing";
                else if (proc.filename.includes("hack")) output = "Hacking";
                else if (proc.filename.includes("share")) output = "Sharing";
            }
        }
        return output;
    }
    
    sendFiles(ns:NS):boolean {
        const files = [
            "/payload/weaken.ts",
            "/payload/grow.ts",
            "/payload/hack.ts",
            "/payload/share.ts"
        ]
        const target = this.server.hostname;
        
        for (const file of files) {
            if (!ns.fileExists(file,"home")) return false;
            if (!ns.scp(file,target,"home")) return false;
        }
        return true;
    }
    
    _calculateThreads(ns:NS,script:string):number {
        const freeRam = this.server.maxRam - this.server.ramUsed;
        const scriptRam = ns.getScriptRam(script);
        return Math.max(0,Math.floor(freeRam / scriptRam));
    }
    
    killOld(ns:NS):boolean {
        const old = ns.ps(this.server.hostname);
        if (old.length > 0) {
            for (const proc of old) {
                return ns.kill(proc.pid);
            }
        }
        return false;
    }

    shouldAction(ns:NS):string {
        const minSec = this.server.minDifficulty ?? 0;
        const currSec = this.server.hackDifficulty ?? 0;
        const secTresh = minSec * 1.2;
        const maxMoney = this.server.moneyMax ?? 0;
        const currMoney = this.server.moneyAvailable ?? 0;
        const moneyThresh = maxMoney/10;
        const currentAction = this.action(ns);
        if (minSec === 0 || currSec === 0 || maxMoney === 0 || currMoney === 0) {
            if (currentAction !== "Sharing") return "SHARE";
        }

        switch(true) {
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
                return "GROW";
            
            default:
                return "HACK";
        }
        return "N/A"
    }

    sendInfo(ns:NS): boolean {
        const port = ns.getPortHandle(this.port)
        const threshSec = (this.server.minDifficulty as number) * 1.2;
        const currSec = (this.server.hackDifficulty as number);
        const currMoney = this.server.moneyAvailable as number;
        const maxMoney = this.server.moneyMax as number;
        const threshMoney = (this.server.moneyMax as number) / 10;
        const minSec = this.server.minDifficulty as number;
        const info = [threshSec,currSec,minSec,currMoney,maxMoney,threshMoney];
        
        if (port.peek() !== info) port.write(info);
        return true;
    }

    doAction(ns:NS,payload:string):boolean {
        if (ns.ps(this.server.hostname).length > 0 && !this.killOld(ns)) return false;
        const threads = this._calculateThreads(ns,payload);
        if (!isFinite(threads) || threads === 0) return false;
        const t = this.server.hostname;
        if (!ns.exec(payload,t,threads,this.port)) return false;
        return true;
    }
    
    runSelf(ns:NS):boolean {
        if (this.server.hostname === "home") return false;
        this.refreshServer(ns)

		if (!this.hasRoot(ns)) {
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
            case "WEAK": return this.doAction(ns,"/payload/weaken.ts");
            case "GROW": return this.doAction(ns,"/payload/grow.ts");
            case "HACK": return this.doAction(ns,"/payload/hack.ts");
            case "SHARE": return this.doAction(ns,"/payload/share.ts");
            case "SEND_H":
            case "SEND_G":
            case "SEND_W":
                return this.sendInfo(ns)
            case "N/A":
            default:
                return false;
        }
    }

    output(ns:NS):string {
        let output:string = ""
        let currSec:number
        let minSec:number
        let maxMoney:number
        let currMoney:number
        let name = this.server.hostname
        if (name.length > 8) name = name.slice(0,5) + "...";

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
    let port = 1
	for (const s of visited.keys()) {
		const entry = visited.get(s)!;
        if (entry.sName == "home") continue;
        if (ns.getServer(entry.sName).isOnline !== undefined) continue;
		servers.push(new ScannedServer(ns,entry.sName,entry.path,port))
        port ++
	}
	return servers;
}

function constructSpinner(seed = Math.random()) {
        const spinners = [
        [`◴`, `◷`, `◶`, `◵`],
        [`▁`,`▂`,`▃`,`▄`,`▅`,`▆`,`▇`,`█`,`▇`,`▆`,`▅`,`▄`,`▃`,`▁`],
        [`▉`,`▊`,`▋`,`▌`,`▍`,`▎`,`▏`,`▎`,`▍`,`▌`,`▋`,`▊`,`▉`],
        [`⣾`,`⣽`,`⣻`,`⢿`,`⡿`,`⣟`,`⣯`,`⣷`],
        [`⠁`,`⠂`,`⠄`,`⡀`,`⢀`,`⠠`,`⠐`,`⠈`,`⠈`,`⠐`,`⠠`,`⢀`,`⡀`,`⠄`,`⠂`,`⠁`],
        [`┤`,`┘`,`┴`,`└`,`├`,`┌`,`┬`,`┐`],
        [`▖`,`▘`,`▝`,`▗`],
        [`◢`,`◣`,`◤`,`◥`],
        [`◰`,`◳`,`◲`,`◱`],
        [`◐`,`◓`,`◑`,`◒`]
    ]
    const s = Math.max(0, Math.min(0.999999, Number(seed) || 0));
    const idx = Math.floor(s * spinners.length);
    return spinners[idx];
}

function display(ns:NS,servers:ScannedServer[],groupChangeInterval:number,spinner:SpinnerInfo) {
    const sprite:string[] = spinner.spinner
    const root:string[] = [];
    const unroot:string[] = [];

    for (const server of servers) {
        if (server.hasRoot(ns)) {
            root.push(server.output(ns));
        } else {
            unroot.push(server.output(ns));
        }
    }

    const rootGroups = makeGroup(root,10);
    const unrootGroups = makeGroup(unroot,10);
    const elapsedMs = servers[0]?.timeActive ?? 0;
    const tick = Math.floor(elapsedMs / (groupChangeInterval * 1000));

    const frame = sprite.length > 0 ? Math.floor(elapsedMs % sprite.length) : 0;
    const rGroupSel = rootGroups.length > 0 ? Math.floor(tick % rootGroups.length) : 0;
    const unGroupSel = unrootGroups.length > 0 ? Math.floor(tick % unrootGroups.length) : 0;

    ns.print(`${colorize(sprite[frame],spinner.r,spinner.g,spinner.b)}\nRoot`);
    if (rootGroups.length > 0) {
        for (const s of rootGroups[rGroupSel]) {
            ns.print(`${s}\n`);
        }
    } else {
        ns.print("(none)\n");
    }

    ns.print("Unroot");
    if (unrootGroups.length > 0) {
        for (const s of unrootGroups[unGroupSel]) {
            ns.print(`${s}\n`);
        }
    } else {
        ns.print("(none)\n");
    }
}

function makeGroup(servers:string[],limit:number = 5):string[][] {
	const fullGroup:string[][] = []
	let group:string[] = []
	let x = 0;
	for (const s of servers) {
		if (x >= limit) {
			x = 0;
			fullGroup.push(group);
			group = [];
		}
		group.push(s);
		x += 1;
	}
    if (group.length < limit) {
        while (group.length < limit) group.push("");
    }
	fullGroup.push(group);
	return fullGroup;
}

function formatGroups(server:string[][],root:boolean) {
    
}

function bDoorWrite(ns:NS,servers:ScannedServer[]) {
    if (!ns.fileExists("backdoors.txt")) ns.write("backdoors.txt");
    let fileContent:string = ""
    for (const server of servers) {
        if (server.server.hostname === "home") continue;
        if (!server.hasRoot(ns)) continue;
        if (!server.server.backdoorInstalled) fileContent += `${server.path.join(";connect ")}; backdoor\n`
    }
    if (fileContent !== ns.read("backdoors.txt")) ns.write("backdoors.txt",fileContent,"w")
}

export async function main(ns:NS) {
    initTail(ns,"unBasic", 600, 500, 12);
    const servers = scan(ns,"home");
    const groupChangeInterval = 5;
    const spinner:SpinnerInfo = {spinner: constructSpinner(),r:15,g:255,b:255};
    const clockServer = servers[0];
    let lastTimeSource = Date.now();
    while (true) {
        const now = Date.now();
        const dt = now - lastTimeSource;
        lastTimeSource = now;

        if (clockServer) {
            clockServer.timeActive += dt;
        }

        for (const server of servers) {
            server.runSelf(ns);
        }
        ns.clearLog();
        display(ns,servers,groupChangeInterval,spinner);
        ns.ui.renderTail();
        bDoorWrite(ns,servers);
        await ns.sleep(200);
    }
}
