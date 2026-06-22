import { DarknetServerData, NS, Server } from "@ns";
import { initTail, colorize }from "lib/common";

export async function main(ns: NS) {
    await initTail(ns,"test",580,700,14)
    ns.atExit(() => exitTasks(ns))
    let ram = ramSetMax(ns)
    checkFiles(ns)
    let x = 0;
    const spinner = pickSpinner()
    if (ram > 8) {
        ns.tprint("INFO: Can run more.")
        ramSetMin(ns)
        ns.exec("hacknet.js","home")

        while (true) {
            await basic(ns,x % spinner.length,spinner);
            x++;
            if (x > spinner.length * 200) x = 0;
        }
    } else {
        while (true) {
            await basic(ns,x % spinner.length,spinner);
            x++;
            if (x > spinner.length * 200) x = 0;
        }
    }
}
async function basic(ns: NS, frame: number, spinner:string[]) {
    const rooted = runRootServers(ns);
    const unrooted = runUnrootServers(ns);
    display(ns, frame, rooted, unrooted, spinner);
    await ns.sleep(100)
}

function ramSetMin(ns: NS) {
    const mem = ns.getScriptRam("testing/otheraio.js","home")
    ns.ramOverride(mem)
}

function ramSetMax(ns: NS) {
    const home = ns.getServer("home")
    const ram = Math.round(home.maxRam);
    ns.ramOverride(ram)
    return ram
}

function maxRamCheck(ns: NS) {
    const home = ns.getServer("home")
    return Math.round(home.maxRam)
}

function freeRamCheck(ns: NS) {
    const home = ns.getServer("home")
    return Math.round(home.maxRam - home.ramUsed)
}

function getServers(ns: NS): [NormalServer[], NormalServer[], NormalServer[]] {
    const allServers: NormalServer[] = scanAll(ns, "home");
    const rooted: NormalServer[] = [];
    const unrooted: NormalServer[] = [];
    const owned: NormalServer[] = [];

    for (const server of allServers) {
        // if (server.hostname === "home") continue;
        // if (server.hasAdminRights) rooted.push(server);
        // else unrooted.push(server);
        switch(true) {
            case server.hostname === "home":
                break;
            
            case server.purchasedByPlayer:
                owned.push(server);
                break;
            
            case server.hasAdminRights:
                rooted.push(server);
                break;
            
            default:
                unrooted.push(server)
                break;
        }
    }
    return [rooted, unrooted, owned];
}

function runOwnedServers(ns:NS, rooted:NormalServer[]) {
    const f = rooted
}

function checkFiles(ns:NS) {
    if (!ns.fileExists("lib/weaken.js","home")||!ns.fileExists("lib/grow.js","home")||!ns.fileExists("lib/hack.js","home")) {
        ns.tprint("ERROR: Core files missing. Please ensure you have these files:\n- weaken.js\n- grow.js\n- hack.js")
        ns.exit()
    }
}

function getNames(servers: NormalServer[]): string {
    let names = "";
    for (const server of servers) names += `${server.hostname}\n`;
    return names;
}

function scanAll(ns: NS, start: string): NormalServer[] {
    const visited: Set<string> = new Set();

    function dfs(host: string) {
        visited.add(host);
        for (const next of ns.scan(host)) {
            if (!visited.has(next)) dfs(next);
        }
    }

    dfs(start ?? "home");

    const servers: NormalServer[] = [];
    for (const host of visited) {
        const s = ns.getServer(host);
        if (isNormalServer(s)) servers.push(s); // darknet ignored
    }
    return servers;
}

function runRootServers(ns: NS) {
    const weakenScript:string = "weaken.js";
    const growScript:string = "grow.js";
    const hackScript:string = "hack.js";
    const rootedServers:NormalServer[] = getServers(ns)[0]

        function actionRank(actionText:string):number {
        const t = String(actionText ?? "").toLowerCase();
        if (t.startsWith("hack")) return 0;
        if (t.startsWith("grow")) return 1;
        if (t.startsWith("weak")) return 2;
        if (t.startsWith("shar")) return 3;
        return 4;
    }

    const allRows:RootRow[] = [];
    for (const server of rootedServers) {
        const securityMinimum:number = server.minDifficulty ?? 0;
        const securityThreshold:number = securityMinimum + 1;
        const securityCurrent:number = server.hackDifficulty ?? 0;
        const moneyCurrent:number = server.moneyAvailable ?? 0;
        const moneyMaximum:number = server.moneyMax ?? 0;
        const moneyThreshold:number = moneyMaximum/10;
        const freeRam:number = server.maxRam - server.ramUsed;

        const procs = ns.ps(server.hostname);
        let action:string = "waiting..."
        if (procs.length == 0) {
            let threads;
            switch (true) {
                case (server.moneyMax ?? 0) == 0:
                    continue;
                
                case securityThreshold <= securityCurrent:
                    ns.scp(`lib/${weakenScript}`,server.hostname,"home");
                    threads = Math.floor(freeRam / ns.getScriptRam(`lib/${weakenScript}`,"home"));
                    if (threads == 0 || !Number.isFinite(threads)) break;
                    ns.exec(`lib/${weakenScript}`,server.hostname,threads,server.hostname,securityMinimum);
                    action = "weakening..."
                    break;
                    
                case moneyCurrent < moneyThreshold:
                    ns.scp(`lib/${growScript}`,server.hostname,"home");
                    threads = Math.floor(freeRam / ns.getScriptRam(`lib/${growScript}`,"home"));
                    if (threads ==0 || !Number.isFinite(threads)) break;
                    ns.exec(`lib/${growScript}`,server.hostname,threads,server.hostname,securityThreshold,moneyMaximum);
                    action = "growing..."
                    break;

                default:
                    ns.scp(`lib/${hackScript}`,server.hostname, "home");
                    threads = Math.floor(freeRam / ns.getScriptRam(`lib/${hackScript}`,"home"));
                    ns.exec(`lib/${hackScript}`,server.hostname,threads,server.hostname,securityThreshold,moneyThreshold);
                    action = "hacking..."
                    break;
            }
        } else {
            action = 
                procs.length > 0
                ? (procs[0].filename === "share.js"
                    ? "sharing..."
                    : procs[0].filename.replace(".js", "ing...")).replace("lib/","")
                : action;
        }

        const row = formatRow(
            [server.hostname, `$${ns.format.number(moneyCurrent,1)}/$${ns.format.number(moneyMaximum,1)}`, `${securityMinimum}/${securityThreshold}/${ns.format.number(securityCurrent,3,1000000)}`,action],ROOT_COLS
        );

        allRows.push({row:row,rank:actionRank(action),server:server.hostname})
        
    }
    allRows.sort((a,b) => (a.rank - b.rank) || a.server.localeCompare(b.server));
    const sortedRows:string[] = allRows.map(r => r.row);
    return sortedRows;
}

function runUnrootServers(ns:NS) {
    const entries = getServers(ns)[1].map(server => ({server,reqHack: server.requiredHackingSkill??0})).sort((a,b) => a.reqHack - b.reqHack);

    const pageItems= entries.slice(0,10);
    
    const output = [];
    for (const item of pageItems) {
        const row = formatRow([item.server.hostname,item.reqHack],UNROOT_COLS);
        if (_canRoot(ns, item.server.hostname)) {
            if (_crackPorts(ns,item.server)) {
                _nukeServer(ns,item.server);
                output.push(colorize(row, 125, 255, 125));
            } else {
                output.push(colorize(row, 255, 255, 150));
            }
        } else {
            output.push(colorize(row, 255, 155, 155));
        }
    }

    return output;
}

function exitTasks(ns: NS) {
    const [servers, _] = getServers(ns);
    ns.ui.closeTail();
    for (const server of servers) {
        ns.tprint(colorize(`${server.hostname}:Killing scripts...`,25,175,255));
        ns.killall(server.hostname);
    }
    ns.tprint(colorize("home:Killing Scripts...",25,175,255));
    ns.tprint(colorize("Monitor shutting down...",100,255,100));
    ns.killall("home",true)
}

function _canRoot(ns: NS,server: string) {
    const requiredLevel = ns.getServerRequiredHackingLevel(server);
    if (ns.getHackingLevel() >= requiredLevel) return true;
    return false;
}

function _nukeServer(ns: NS,server: NormalServer) {
    return ns.nuke(server.hostname)
}

function _crackPorts(ns: NS, server: NormalServer): boolean {
    const attacks: Array<[string, (host: string) => void]> = [
        ["BruteSSH.exe", ns.brutessh],
        ["FTPCrack.exe", ns.ftpcrack],
        ["relaySMTP.exe", ns.relaysmtp],
        ["HTTPWorm.exe", ns.httpworm],
        ["SQLInject.exe", ns.sqlinject],
    ];

    let openPorts = 0;
    const reqPorts: number = server.numOpenPortsRequired ?? 0;

    for (const [file, fn] of attacks) {
        if (openPorts >= reqPorts) return true;
        if (!ns.fileExists(file, "home")) return false;
        fn(server.hostname);
        openPorts++;
    }

    return openPorts >= reqPorts;
}

//Format Utils
function stripAnsi(s: string): string {
    return String(s).replace(/\x1b\[[0-9;]*m/g, "");
}
function visibleLen(s: string): number {
    return stripAnsi(s).length;
}
function padVisible(s: string | number, width: number, align: Align = "left"): string {
    const text = String(s ?? "");
    const len = visibleLen(text);
    const n = Math.max(0, width - len);

    if (align === "right") return " ".repeat(n) + text;
    if (align === "center") {
        const left = Math.floor(n / 2);
        const right = n - left;
        return " ".repeat(left) + text + " ".repeat(right);
    }
    return text + " ".repeat(n); // left
}

function formatRow(cells: Array<string | number>, cols: ColDef[]): string {
    const parts = cells.map((c, i) => padVisible(c, cols[i].w, cols[i].align));
    return parts.join("|");
}

function formatHeader(cols: ColDef[]): string {
    const labelRow = formatRow(cols.map(c => c.label), cols);
    const underlineRow = cols.map(c => "_".repeat(c.w)).join("|");
    return `${labelRow}\n${underlineRow}`;
}
function pageSlice<T>(items: T[], pageIndex = 0, windowSize = 10): { pageItems: T[]; size: number; page: number; pageCount: number } {
    const len = items.length;
    const size = Math.max(1, Math.floor(windowSize));

    if (len === 0) return { pageItems: [], size, page: 0, pageCount: 0 };

    const pageCount = Math.max(1, Math.ceil(len / size));
    const page = ((Math.floor(pageIndex) % pageCount) + pageCount) % pageCount;

    const start = page * size;
    const pageItems = items.slice(start, start + size);
    return { pageItems, size, page, pageCount };
}

const ROOT_COLS: ColDef[] = [
    { label: "Server", w: 19, align: "left" },
    { label: "Money", w: 15, align: "left" },
    { label: "Security", w: 15, align: "left" },
    { label: "Action", w: 12, align: "left" }
];

const UNROOT_COLS: ColDef[] = [
    { label: "Server", w: 42, align: "left" },
    { label: "Hacking Level", w: 16, align: "left" }
];

// Display

function display(ns:NS, frame:number,rooted:Array<string>, unrooted:Array<string>, spinner:string[]) {
    ns.clearLog();

    const rootHeader = formatHeader(ROOT_COLS);
    const unrootHeader = formatHeader(UNROOT_COLS);

    const printRoot = rooted.join("\n");
    const printUnroot = unrooted.join("\n")

    const body = `${rootHeader}\n${printRoot}\n\n${unrootHeader}\n${printUnroot}`;
    const spin = colorize(`${spinner[frame]} `.repeat(10),Math.random()*255,Math.random()*255,Math.random()*255)
    ns.print(`${spin} RAM: ${ns.format.ram(freeRamCheck(ns))}/${ns.format.ram(maxRamCheck(ns))}\n${body}`)
    ns.ui.renderTail()
}

function pickSpinner(seed = Math.random()):string[] {
    const spinners = [
        [`◴`, `◷`, `◶`, `◵`],
        [`▁`,`▂`,`▃`,`▄`,`▅`,`▆`,`▇`,`█`,`▇`,`▆`,`▅`,`▄`,`▃`,`▁`],
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

// Types
type NormalServer = Server
type Align = "left" | "right" | "center";
interface ColDef {
    label: string;
    w: number;
    align: Align;
}
type RootRow = {
    row: string
    rank: number;
    server: string;
};

// Type guard: keeps only regular servers (excludes darknet server shape)
function isNormalServer(s: ReturnType<NS["getServer"]>): s is NormalServer {
    return "sshPortOpen" in s
        && "ftpPortOpen" in s
        && "smtpPortOpen" in s
        && "httpPortOpen" in s
        && "sqlPortOpen" in s;
}
