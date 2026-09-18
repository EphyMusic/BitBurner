// import { NS, Server } from "@ns";
import { ScannedServer, bDoorWrite, Save } from "./lib/server";
import { colorize, initTail } from "./lib/common";
import { initHacknet, runHacknet, HacknetNode, getProduction} from "./lib/hacknet"


type SpinnerInfo = {
    spinner: string[];
    r: number;
    g: number;
    b: number;
};

type PageEnum = "ROOT" | "UNROOT" | "PROXY" | "HNET";

function page(ns: NS): PageEnum {
    const pageFile = "/unBasic/cfg/page.txt";

    if (!ns.fileExists(pageFile)) {
        ns.write(pageFile, "ROOT", "w");
        return "ROOT";
    }

    const value = ns.read(pageFile).trim();

    if (value === "ROOT" || value === "UNROOT" || value === "PROXY" || value === "HNET") {
        return value;
    }

    return "ROOT";
}

function cmd(ns: NS,servers: ScannedServer[]) {
    const cmdFile = "/unBasic/cfg/cmd.txt";
    if (!ns.fileExists(cmdFile)) ns.write(cmdFile);
    const cmdContent = ns.read(cmdFile).trim();
    if (!cmdContent || cmdContent === "") return;
    ns.write(cmdFile, "", "w");
    const [command,hostname, property, value] = cmdContent.split("|");
    for (const server of servers) {
        if (server.server.hostname != hostname) continue;
        switch(command) {
            case "set":
                if (!hostname || !property || !value) return;
                if (property === "state" && (value === "HACK" || value === "GROW" || value === "USEPROXY")) {
                    server.state = value;
                    server.killOld(ns)
                }
                if (property === "target" && servers.some(s => s.server.hostname === value)) {
                    server.target = value;
                    server.killOld(ns);
                }
                break;
            case "read":
                if (!hostname) return;
                if (property && property !== "all" && property !== "*" && property !== "ALL") {
                    if (server[property]) {
                        ns.tprint(colorize(`Server ${hostname} ${property}: ${server[property]}`,0,255,255));
                    } else if (server.server[property]) {
                        ns.tprint(colorize(`Server ${hostname} ${property}: ${server.server[property]}`,0,255,255));
                    } else {
                        ns.tprint(colorize(`Server ${hostname}.${property}: not found`,255,0,0) );
                    }
                } else if (!property || property === "all" || property === "*" || property === "ALL") {
                    let output = "unBasic Properties:\n";
                    for (const key in server) {
                        if (server.hasOwnProperty(key)) {
                            output += `${key}: ${String(server[key])}\n`;
                        }
                    }
                    output += "\n-_-_-_-_-_-_-_\n\nServer Properties:\n";
                    for (const key in server.server) {
                        if (server.server.hasOwnProperty(key)) {
                            output += `${key}: ${String(server.server[key])}\n`;
                        }
                    }
                    ns.tprint(colorize(`Server ${hostname} info:\n${output}`,0,255,255));
                }
                break;

            default:
                return;
        }
    }
    return;
}

function updateDisplay(ns:NS,page:PageEnum,group:string[]) {
    let w:number = 200;
    let [x,y] = ns.ui.windowSize();
    let h = Math.min(y,50 + Math.max(0,group.length - 1) * 19);
    let title = "unBasic"

    switch (true) {
        case group.length < 10:
            h += 45;
            break;
        case group.length < 30:
            h += 20;
            break;
    }

    switch (page) {
        case "ROOT":
            w = 650;
            title += " - Root";
            break;
        case "UNROOT":
            w = 270;
            title += " - Unroot";
            break;
        case "PROXY":
            w = 550;
            h = h*1.7
            title += " - Proxy";
            break;
        case "HNET":
            w = 450;
            title += " - Hacknet";
            break;
    }
    x += -w;
    ns.ui.resizeTail(w,h);
    ns.ui.setTailTitle(title);
    ns.ui.moveTail(x,0);
}

function constructSpinner(seed = Math.random()) {
    const spinners = [
        ["◴", "◷", "◶", "◵"],
        ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█", "▇", "▆", "▅", "▄", "▃", "▁"],
        ["▉", "▊", "▋", "▌", "▍", "▎", "▏", "▎", "▍", "▌", "▋", "▊", "▉"],
        ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"],
        ["⠁", "⠂", "⠄", "⡀", "⢀", "⠠", "⠐", "⠈", "⠈", "⠐", "⠠", "⢀", "⡀", "⠄", "⠂", "⠁"],
        ["┤", "┘", "┴", "└", "├", "┌", "┬", "┐"],
        ["▖", "▘", "▝", "▗"],
        ["◢", "◣", "◤", "◥"],
        ["◰", "◳", "◲", "◱"],
        ["◐", "◓", "◑", "◒"]
    ];
    const s = Math.max(0, Math.min(0.999999, Number(seed) || 0));
    const idx = Math.floor(s * spinners.length);
    return spinners[idx];
}

function formatGroups(ns: NS, servers: ScannedServer[], limit = 5, dt: number): string[][] {
    const root: string[] = [];
    const unroot: string[] = [];
    const proxy: string[] = [];
    const rootServers: ScannedServer[] = [];
    const unrootServers: ScannedServer[] = [];
    const proxyServers: ScannedServer[] = [];

    for (const server of servers) {
        if (server.server.purchasedByPlayer) proxyServers.push(server);
        else if (server.server.hasAdminRights) rootServers.push(server);
        else unrootServers.push(server);
    }

    const rootOrder: Record<string, number> = {
        Hacking: 0,
        Growing: 1,
        Weakening: 2,
        Sharing: 3,
        "NO RAM": 4,
        Waiting: 5
    };

    rootServers.sort((a, b) => {
        const aAction = a.action(ns);
        const bAction = b.action(ns);
        const aRank = rootOrder[aAction] ?? rootOrder.Waiting;
        const bRank = rootOrder[bAction] ?? rootOrder.Waiting;
        return aRank - bRank;
    });

    proxyServers.sort((a,b) => {
        const aAction = a.action(ns);
        const bAction = b.action(ns);
        const aRank = rootOrder[aAction] ?? rootOrder.Waiting;
        const bRank = rootOrder[bAction] ?? rootOrder.Waiting;
        return aRank - bRank;
    })

    unrootServers.sort((a, b) => {
        const aSkill = a.server.requiredHackingSkill ?? 0;
        const bSkill = b.server.requiredHackingSkill ?? 0;
        return aSkill - bSkill;
    });

    for (const server of rootServers) root.push(server.output(ns, dt));
    for (const server of unrootServers) unroot.push(server.output(ns, dt));
    for (const server of proxyServers) proxy.push(server.output(ns, dt));

    return [root,unroot,proxy];
}

function display(ns: NS, servers: ScannedServer[], nodes:HacknetNode[], spinner: SpinnerInfo, frame: number, dt: number) {
    const sprite = spinner.spinner;
    const groups = formatGroups(ns, servers, 10, dt);
    const nodeInfo = getProduction(ns,nodes);
    const nodeGroup:string[] = []
    for (const node of nodes) nodeGroup.push(node.output(ns));
    const pages = {
        ROOT: groups[0],
        UNROOT: groups[1],
        PROXY: groups[2],
        HNET: nodeGroup
    };

    const currentPage = page(ns);

    ns.clearLog();
    updateDisplay(ns,currentPage,pages[currentPage]);
    ns.print(`${colorize(sprite[frame], spinner.r, spinner.g, spinner.b)}`);
    // ns.print(`${currentPage}`);
    if (currentPage == "HNET") {
        ns.print("$" + ns.format.number(nodeInfo.perSecond) + "/s | $" + ns.format.number(nodeInfo.total))
    }
    let i = 0;
    for (const entry of pages[currentPage]) {
        ns.print(`[${i}]${entry}`);
        i++;
    }
}

function scan(ns: NS, start = "home"): ScannedServer[] {
    const visited = new Map<string, { sName: string; path: string[] }>();

    function dfs(host: string, path: string[] = []) {
        const fullPath = [...path, host];
        visited.set(host, { sName: host, path: fullPath });

        for (const next of ns.scan(host)) {
            if (!visited.has(next)) dfs(next, fullPath);
        }
    }

    dfs(start);

    const servers: ScannedServer[] = [];
    let port = 1;
    for (const entryName of visited.keys()) {
        const entry = visited.get(entryName)!;
        if (entry.sName === "home") continue;
        if (ns.getServer(entry.sName).isOnline !== undefined) continue;
        servers.push(new ScannedServer(ns, entry.sName, entry.path, port));
        port += 1;
    }
    return servers;
}

function scanLite(ns: NS, servers: ScannedServer[], start = "home") {
    const visited = new Map<string, { sName: string; path: string[] }>();

    function dfs(host: string, path: string[] = []) {
        const fullPath = [...path, host];
        visited.set(host, { sName: host, path: fullPath });
        for (const next of ns.scan(host)) {
            if (!visited.has(next)) dfs(next, fullPath);
        }
    }

    dfs(start);

    let lastOldPort = 1;
    for (const server of servers) lastOldPort = Math.max(lastOldPort, server.resetPort);

    let port = lastOldPort + 1;
    const seen = new Set(servers.map(server => server.server.hostname));

    for (const host of visited.keys()) {
        if (host === "home" || seen.has(host)) continue;

        const entry = visited.get(host);
        if (entry) {
            servers.push(new ScannedServer(ns, entry.sName, entry.path, port));
            seen.add(entry.sName);
            port += 2;
        }
    }
}

function manageProxies(ns:NS,servers:ScannedServer[]) {
    const targets:ScannedServer[] = []
    const proxies:ScannedServer[] = []
    for (const server of servers) {
        if (server.state === "USEPROXY") {
            targets.push(server);
        } else if (server.state === "PROXY" || server.state === "PROXGROW" || server.state === "PROXHACK") {
            proxies.push(server);
        }
    }
    for (const target of targets) {
        let extras = 0;
        if (target.paired == 0) {
            for (const proxy of proxies) {
                if (proxy.target === "N/A") {
                    proxy.target = target.server.hostname;
                    target.paired = 1;
                    break;
                }
            }
            if (target.paired == 0 && ns.ramOverride() >= 9.60) {
                const prxName = `PRX`;
                ns.cloud.purchaseServer(prxName,16);
                extras++;
            }
        }
    }

    for (const proxy of proxies) {
        if (ns.ramOverride() >= 9.60) proxy.upgradeSelf(ns);
        proxy.runSelf(ns);
    }
}

function initRam(ns:NS,tram:number) {
    /// Basic Module 7.10GB
    /// With Proxy Purchase/Upgrade: 9.60GB
    /// With Hacknet: 13.25GB
    /// Plus Contracts: +15GB
    /// Plus Page: +1.60GB
    /// Total: 14.85GB but 29.85GB if all features are considered
    const homeRam = ns.getServerMaxRam("home")
    ns.tprint(colorize("Booting unBasic...",0,255,255) + colorize("\nNote: If display is cut off, please go, in the bitburner menu, to Options -> System -> Netscript Log Size and set to 80+.",100,255,100));
    if (ns.args.length > 0 && ns.args[0] === "--cleanup") return;
    if (tram <= homeRam - 1.65) {
        ns.tprint("ultimate unlock i don't wanna write this rn but we can do contracts now")
        ns.ramOverride(Math.min(tram,homeRam - 1.65));
    } 
    else if (14.85 <= homeRam - 1.65) {
        ns.tprint(`${colorize('Can run proxy automation, hacknet automation, and page system with basic.\nPage system: alias page="home;unBasic/lib/page.ts"\nUse: -r for Root Page | -u for Unroot Page | -p for Proxy Page | -h for Hacknet Page',0,255,100)}`)
        ns.ramOverride(Math.min(14.85,homeRam - 1.65));
    } else {
        ns.tprint(`${colorize('Running basic. No access to page system. Switch pages manually with: nano unBasic/cfg/page.txt.',255,200,50)}\n${colorize("WARNING: One line only. Allowed config text (CHOOSE ONE ONLY) [ROOT,UNROOT,PROXY]",255,20,20)}`)
        ns.ramOverride(7.10);
    }
}

function updateRam(ns:NS,tram:number) {
    let currentOverride = ns.ramOverride();
    const homeRamBuffered = ns.getServerMaxRam("home") - 1.65;
    if (currentOverride < Math.min(tram,homeRamBuffered)) {
        currentOverride = ns.ramOverride(Math.min(tram,homeRamBuffered));
        if (currentOverride < 8) {
            ns.tprint(colorize(`New Features Unlocked!\n-Proxies will purchase themselves. Eventually they'll also manage themselves, like upgrading ram and cores.\n-Hacknet Node Manager: automatically manages nodes.\n-Page system available: alias page="home;unBasic/lib/page.ts"\n    Use: -r for Root Page | -u for Unroot Page | -p for Proxy Page | -h for Hacknet Page`,0,255,50))
        }
    }
}

function runServers(ns:NS,servers:ScannedServer[]) {
    for (const server of servers) {
        if (server.state === "USEPROXY") {
            server.normalizeColor();
            continue;
        } else if (server.state === "PROXY") {
            continue;
        }
        server.normalizeColor();
        server.runSelf(ns);
    }
}

function exitTasks(ns: NS,save:Save) {
    const servers = scan(ns, "home");
    ns.ui.closeTail();
    for (const s of servers) {
        if (s.server.hostname == "home") continue;
        const procs = ns.ps(s.server.hostname);
        if (procs.length > 0) {
            ns.tprint(colorize(`Killing script on ${colorize(s.server.hostname, 0, 255, 255)}`, 150, 255, 100));
            for (const proc of procs) {
                ns.kill(proc.pid);
            }
        }
    }
    save.saveServers(ns,servers);
    ns.tprint("Servers saved to " + save.saveFile)
    ns.exit();
}

function cleanUp(ns:NS,servers:ScannedServer[]) {
    const files = [
        "/payload/hack.ts",
        "/payload/grow.ts",
        "/payload/weaken.ts",
        "/payload/share.ts"
    ];
    for (const server of servers) {
        for (const file of files) {
            if (ns.fileExists(file,server.server.hostname)) {
                ns.rm(file,server.server.hostname);
            }
        }
    }
}

export async function main(ns: NS) {
    ns.ramOverride(7.10);
    let skip = false;
    if (ns.args[0] && ns.args[0] == "--s") skip = true; 
    const TRAM = 29.85;
    ///Init
    ns.ui.clearTerminal();
    initRam(ns,TRAM);
    const saveFile = "/unBasic/cfg/state.json"
    const saveSystem = new Save(ns,saveFile);
    const servers = scan(ns, "home");
    const nodes = await initHacknet(ns);
    const spinner: SpinnerInfo = { spinner: constructSpinner(), r: 15, g: 255, b: 255 };
    let frame = 0;
    let cycles = 0;
    const clockServer = servers[0];
    let lastTimeSource = Date.now();
    
    ///Cleanup Check
    if (ns.args.length > 0) {
        if (ns.args[0] === "--cleanup") {
            cleanUp(ns,servers);
            ns.tprint(colorize("All server payload files cleaned up.",0,255,100));
            ns.exit();
        }
    }
    
    ///Init Display
    initTail(ns, "unBasic - Init", 200, 300, 12);

    ///Load Save if Possible
    const saveState = new Map(saveSystem.loadServers(ns).map((saved) => [saved.hostname,saved]));
    let remaining = servers.length
    const output:string[] = []
    ns.clearLog();
    ns.print(`Loading ${remaining} servers...`);
    ns.ui.renderTail();
    for (const server of servers) {
        const save = saveState.get(server.server.hostname);
        if (!save) {
            output.push(`${server.server.hostname} not found...`);
            continue;
        }
        if (server.server.hasAdminRights != save.rooted && server.server.hasAdminRights === false) {
            ns.clearLog()
            ns.print(colorize("Augmentations may have been installed, initiating a reset.\nWill reset server states.",255,100,50) + `\n Triggered by: ${server.server.hostname}`)
            await ns.sleep(2000);
            break;
        }
        server.state = save.state;
        server.target = save.target;
        server.paired = save.paired;
        server.resetPort = save.resetPort;
        if (!skip) await ns.sleep(500 * Math.random());
        output.push(`Loaded ${server.server.hostname}...`);
        remaining --;
        ns.clearLog();
        ns.print(output.join("\n"));
        ns.print(`Loading ${remaining} servers...`);
        ns.ui.renderTail();
    }
    ns.print(colorize("Server states loaded. Booting...",0,255,50));
    ns.ui.renderTail();
    ns.atExit(() => exitTasks(ns,saveSystem));
    if (!skip) await ns.sleep(Math.max(1000,2000 * Math.random()));

    ///Run
    while (true) {
        updateRam(ns,TRAM);
        cmd(ns, servers);
        scanLite(ns, servers, "home");
        const now = Date.now();
        const dt = now - lastTimeSource;
        lastTimeSource = now;

        if (clockServer) clockServer.timeActive += dt;
        runServers(ns,servers);

        manageProxies(ns,servers);

        if (ns.ramOverride() >= 13.25) runHacknet(ns,nodes,dt);

        ns.clearLog();
        display(ns, servers, nodes, spinner, frame, dt);
        ns.ui.renderTail();
        bDoorWrite(ns, servers);

        frame += 1;
        if (frame >= spinner.spinner.length) {
            frame = 0;
            cycles += 1;
            if (cycles > 30) {
                spinner.spinner = constructSpinner();
                cycles = 0;
            }
        }
        
        await ns.sleep(100);
    }
}

