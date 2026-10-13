import { colorize, constructSpinner } from "./lib/common";
import { CloudServer } from "./lib/cloud";
import { runContract } from "./lib/contract";

const BASE_RAM_REQUIRED = 19.8;
const CONTRACT_RAM_REQUIRED = 34.8;
const HOME_RAM_BUFFER = 1.65;
const CONTRACT_SCAN_INTERVAL_MS = 5000;

class ScannedServer {
    server: Server;
    readonly path: string[];

    constructor(ns: NS, hostname: string, path: string[]) {
        this.server = ns.getServer(hostname);
        this.path = path;
    }

    tryRoot(ns: NS): boolean {
        this.server = ns.getServer(this.server.hostname);
        if (this.server.hasAdminRights) return true;
        if ((this.server.requiredHackingSkill ?? 0) > ns.getHackingLevel()) return false;

        const requiredPorts = this.server.numOpenPortsRequired ?? 0;
        const programs = ["BruteSSH.exe", "FTPCrack.exe", "relaySMTP.exe", "HTTPWorm.exe", "SQLInject.exe"];
        const availablePorts = programs.filter(program => ns.fileExists(program, "home")).length;
        if (availablePorts < requiredPorts) return false;

        const portTools = [
            {program: "BruteSSH.exe", action: ns.brutessh},
            {program: "FTPCrack.exe", action: ns.ftpcrack},
            {program: "relaySMTP.exe", action: ns.relaysmtp},
            {program: "HTTPWorm.exe", action: ns.httpworm},
            {program: "SQLInject.exe", action: ns.sqlinject}
        ];
        let openedPorts = 0;
        for (const {program, action} of portTools) {
            if (openedPorts >= requiredPorts) break;
            if (!ns.fileExists(program, "home")) break;
            if (!action(this.server.hostname)) break;
            openedPorts++;
        }
        return openedPorts >= requiredPorts && ns.nuke(this.server.hostname);
    }
}

function scanPaths(ns: NS, start = "home"): Map<string, string[]> {
    const paths = new Map<string, string[]>();

    function visit(host: string, path: string[] = []) {
        const fullPath = [...path, host];
        paths.set(host, fullPath);
        for (const next of ns.scan(host)) {
            if (!paths.has(next)) visit(next, fullPath);
        }
    }

    visit(start);
    return paths;
}

function estimateRamDemand(ns:NS, hostname:string): number {
    const server = ns.getServer(hostname);
    const moneyMax = server.moneyMax ?? 0;
    if (moneyMax <= 0) return 0;

    const vHackPercent = ns.hackAnalyze(hostname);
    const vHackThreadsEstimate = ns.hackAnalyzeThreads(hostname, moneyMax / 2);
    const vHackRam = ns.getScriptRam("/Proxxer/payload/hack.ts");
    const vGrowRam = ns.getScriptRam("/Proxxer/payload/grow.ts");
    const vWeakenRam = ns.getScriptRam("/Proxxer/payload/weaken.ts");

    if (vHackPercent > 0 && Number.isFinite(vHackThreadsEstimate) && vHackThreadsEstimate > 0) {
        const vHackThreads = Math.max(1, Math.ceil(vHackThreadsEstimate));
        const stolenFraction = Math.min(0.9, vHackPercent * vHackThreads);
        const vGrowThreads = Math.ceil(ns.growthAnalyze(hostname, 1 / (1 - stolenFraction), 1));
        const securityIncrease = ns.hackAnalyzeSecurity(vHackThreads, hostname)
            + ns.growthAnalyzeSecurity(vGrowThreads, hostname, 1);
        const vWeakenPerThread = ns.weakenAnalyze(1, 1);
        const vWeakenThreads = vWeakenPerThread > 0
            ? Math.ceil(securityIncrease / vWeakenPerThread)
            : Infinity;
        const demand = vHackThreads * vHackRam + vGrowThreads * vGrowRam + vWeakenThreads * vWeakenRam;
        if (Number.isFinite(demand)) return demand;
    }

    const requiredSkill = server.requiredHackingSkill ?? 0;
    return moneyMax * (1 + (server.minDifficulty ?? 0)) * (1 + requiredSkill);
}

function scan(ns:NS,servers: CloudServer[] = []): CloudServer[] {
    const seen = new Set(servers.map(server => server.target.hostname));
    const proxyDemandLoads = new Map<string, number>();
    const proxyTargetCounts = new Map<string, number>();
    const existingProxies: Set<string> = new Set(ns.cloud.getServerNames());
    for (const server of servers) {
        const proxy = server.server.hostname;
        existingProxies.add(proxy);
        proxyDemandLoads.set(
            proxy,
            (proxyDemandLoads.get(proxy) ?? 0) + estimateRamDemand(ns, server.target.hostname)
        );
        proxyTargetCounts.set(proxy, (proxyTargetCounts.get(proxy) ?? 0) + 1);
    }
    for (const proxy of existingProxies) {
        if (!proxyDemandLoads.has(proxy)) proxyDemandLoads.set(proxy, 0);
        if (!proxyTargetCounts.has(proxy)) proxyTargetCounts.set(proxy, 0);
    }
    let nextProxyId = 0;
    while (ns.serverExists(`PRX-${nextProxyId}`)) nextProxyId++;

    const targets = [...scanPaths(ns)]
        .filter(([host]) => host !== "home")
        .map(([hostname, path]) => new ScannedServer(ns, hostname, path))
        .filter(server => server.tryRoot(ns) && !seen.has(server.server.hostname))
        .filter(server => (server.server.moneyMax ?? 0) > 0)
        .map(server => ({
            hostname: server.server.hostname,
            path: server.path,
            demand: estimateRamDemand(ns, server.server.hostname)
        }))
        .sort((a, b) => b.demand - a.demand || a.hostname.localeCompare(b.hostname));

    for (const {hostname, path, demand} of targets) {
        let cloud: CloudServer | null = null;
        let existingProxy = "";
        let lowestExistingDemand = Infinity;
        for (const proxy of existingProxies) {
            const proxyDemand = proxyDemandLoads.get(proxy) ?? 0;
            if ((proxyTargetCounts.get(proxy) ?? 0) < 4 && proxyDemand < lowestExistingDemand) {
                existingProxy = proxy;
                lowestExistingDemand = proxyDemand;
            }
        }
        if (existingProxy) {
            cloud = CloudServer.create(
                ns,
                existingProxy,
                hostname,
                path,
                (proxyTargetCounts.get(existingProxy) ?? 0) === 0
            );
        }

        const preferredProxy = `PRX-${nextProxyId}`;
        if (!cloud) cloud = CloudServer.create(ns, preferredProxy, hostname, path);
        if (cloud) {
            if (cloud.server.hostname === preferredProxy) {
                nextProxyId++;
                while (ns.serverExists(`PRX-${nextProxyId}`)) nextProxyId++;
            }
        }

        if (!cloud && proxyDemandLoads.size === 0) {
            const firstProxyCost = ns.cloud.getServerCost(8);
            if (ns.getPlayer().money < firstProxyCost) {
                ns.print("Not enough money to purchase the first Proxxer server; restarting unBasic.");
                ns.spawn("/unBasic/unbasic.ts", {threads:1, spawnDelay:0});
                return servers;
            }
        }

        if (!cloud && proxyDemandLoads.size > 0) {
            let vSharedProxy = "";
            let lowestDemand = Infinity;
            for (const [proxy, proxyDemand] of proxyDemandLoads) {
                if ((proxyTargetCounts.get(proxy) ?? 0) < 4 && proxyDemand < lowestDemand) {
                    vSharedProxy = proxy;
                    lowestDemand = proxyDemand;
                }
            }
            if (vSharedProxy) {
                cloud = CloudServer.create(ns, vSharedProxy, hostname, path, false);
            }
        }

        if (!cloud) continue;
        seen.add(hostname);
        servers.push(cloud);
        proxyDemandLoads.set(
            cloud.server.hostname,
            (proxyDemandLoads.get(cloud.server.hostname) ?? 0) + demand
        );
        proxyTargetCounts.set(
            cloud.server.hostname,
            (proxyTargetCounts.get(cloud.server.hostname) ?? 0) + 1
        );
    }
    return servers;
}


function observeTailWidth(title:string, onResize:(width:number) => void):() => void {
    const doc = eval("document") as Document;
    const header = [...doc.querySelectorAll(".drag")].find(
        element => element.textContent?.includes(title)
    );
    const tail = header?.parentElement;
    if (!tail) throw new Error(`Unable to find tail window titled "${title}"`);

    const vHeader = header as HTMLElement;
    const vTail = tail as HTMLElement;
    const vHeaderColor = "#0011fd";
    const vBodyColor = "#025049";
    vHeader.style.backgroundColor = vHeaderColor;
    vTail.style.backgroundColor = vBodyColor;
    vTail.querySelectorAll<HTMLElement>(".MuiPaper-root").forEach(panel => {
        if (panel !== vHeader) panel.style.backgroundColor = vBodyColor;
    });

    const ResizeObserverConstructor = doc.defaultView?.ResizeObserver;
    if (!ResizeObserverConstructor) throw new Error("ResizeObserver is unavailable");
    
    const observer = new ResizeObserverConstructor(() => {
        onResize(tail.getBoundingClientRect().width);
    });
    observer.observe(tail);
    onResize(tail.getBoundingClientRect().width);
    return () => observer.disconnect();
}

function exitTasks(ns: NS, servers:CloudServer[]) {
    ns.ui.closeTail();
    const proxies = new Set(servers.map(server => server.server.hostname));
    for (const proxy of proxies) {
        if (proxy == "home") continue;
        const procs = ns.ps(proxy);
        if (procs.length > 0) {
            ns.tprint(colorize(`Killing script on ${colorize(proxy, 0, 255, 255)}`, 150, 255, 100));
            for (const proc of procs) {
                ns.kill(proc.pid);
            }
        }
    }
}

function initTail(ns: NS, onExit:() => void, title?: string, width?: number, height?: number, fontSize?: number) {
    ns.disableLog("ALL");
    ns.ui.openTail();
    ns.ui.setTailTitle(title ?? "Test");
    const [x, y] = ns.ui.windowSize();
    ns.ui.resizeTail(width ?? x / 7, height ?? y / 7);
    ns.ui.setTailFontSize(fontSize ?? 14);
    ns.ui.moveTail(x - (width ?? x / 7), 0);
    ns.ui.renderTail();
    ns.atExit(onExit);
}

function display(ns:NS, output:string[], tailWidth:number) {
    ns.clearLog();
    const fontSize = 12;
    const visibleLength = (text:string) => text.replace(/\x1b\[[0-9;]*m/g, "").length;
    const padVisible = (text:string, width:number) =>
        text + " ".repeat(Math.max(0, width - visibleLength(text)));
    const cardLines = output.map(entry => {
        const lines = entry.split("\n").slice(0, 4);
        while (lines.length < 3) lines.push("");
        return lines;
    });
    const cardWidth = Math.max(32, ...cardLines.flatMap(lines => lines.map(visibleLength)));
    const estimatedCardPixels = (cardWidth + 4) * fontSize * 0.62 + 8;
    const columns = Math.max(1, Math.min(3, Math.floor((tailWidth + 8) / estimatedCardPixels)));
    const border = `+${"-".repeat(cardWidth + 2)}+`;
    const cards = cardLines.map(lines => [
        border,
        `| ${colorize(padVisible(lines[0], cardWidth), 100, 220, 255)} |`,
        `| ${colorize(padVisible(lines[1], cardWidth), 100, 255, 140)} |`,
        `| ${colorize(padVisible(lines[2], cardWidth), 255, 210, 100)} |`,
        // `| ${colorize(lines[3].padEnd(cardWidth), 255, 150, 100)} |`,
        border
    ]);
    const displayLines = [
        colorize(`PROXXER // PROXY SCHEDULER     SERVERS: ${output.length}`, 90, 220, 255)
    ];

    if (cards.length === 0) {
        displayLines.push(colorize("No proxy servers available.", 180, 180, 180));
    }
    
    for (let start = 0; start < cards.length; start += columns) {
        const row = cards.slice(start, start + columns);
        for (let line = 0; line < row[0].length; line++) {
            displayLines.push(row.map(card => card[line]).join("  "));
        }
        if (start + columns < cards.length) displayLines.push("");
    }
    
    ns.print(displayLines.join("\n"));
    ns.ui.renderTail();
}

function initRam(ns:NS) {
    const ramAvailable = ns.getServerMaxRam("home") - HOME_RAM_BUFFER;
    const requestedRam = ramAvailable >= CONTRACT_RAM_REQUIRED
        ? CONTRACT_RAM_REQUIRED
        : ramAvailable >= BASE_RAM_REQUIRED ? BASE_RAM_REQUIRED : HOME_RAM_BUFFER;
    let allocatedRam = ns.ramOverride(requestedRam);

    if (allocatedRam < BASE_RAM_REQUIRED && requestedRam === CONTRACT_RAM_REQUIRED
        && ramAvailable >= BASE_RAM_REQUIRED) {
        allocatedRam = ns.ramOverride(BASE_RAM_REQUIRED);
    }

    if (allocatedRam >= CONTRACT_RAM_REQUIRED) {
        ns.tprint(colorize("Proxxer started with contract processing enabled.", 0, 255, 100));
    } else if (allocatedRam >= BASE_RAM_REQUIRED) {
        ns.tprint(colorize("Proxxer started without contract processing.", 255, 200, 50));
    } else {
        ns.tprint(colorize(
            `Proxxer requires at least ${BASE_RAM_REQUIRED} GB of script RAM; current allocation is ${allocatedRam} GB.`,
            255,
            50,
            50
        ));
    }
}

export async function main(ns: NS) {
    ns.ramOverride(1.65);
    initRam(ns);
    let servers:CloudServer[] = [];
    const tailTitle = "Proxxer";
    let tailWidth = 0;
    let disconnectTailObserver = () => {};
    initTail(ns, () => {
        disconnectTailObserver();
        exitTasks(ns, servers);
    }, tailTitle, 630, 765, 14);
    disconnectTailObserver = observeTailWidth(tailTitle, width => {
        tailWidth = width;
    });
    const processedContracts = new Set<string>();
    let nextContractScan = 0;
    let lastTime = Date.now();
    await ns.sleep(10);
    const currentTime = Date.now();
    let dt = currentTime - lastTime;

    while (true) {
        const currentTime = Date.now();
        dt = currentTime - lastTime;
        lastTime = currentTime;
        servers = scan(ns, servers);
        if (currentTime >= nextContractScan) {
            processContracts(ns, processedContracts);
            nextContractScan = currentTime + CONTRACT_SCAN_INTERVAL_MS;
        }
        const output = servers.map(server => {
            server.runSelf(ns, dt);
            return {
                hostname: server.target.hostname,
                difficulty: server.target.hackDifficulty ?? Infinity,
                card: server.output(ns)
            };
        }).sort((a, b) => a.difficulty - b.difficulty || a.hostname.localeCompare(b.hostname));
        bDoorWrite(ns, servers);
        display(ns, output.map(server => server.card), tailWidth);
        await ns.sleep(10);
    }
}

function processContracts(ns: NS, processedContracts: Set<string>): void {
    const pendingContracts: {hostname:string, filename:string, key:string}[] = [];
    for (const hostname of scanPaths(ns).keys()) {
        if (!ns.getServer(hostname).hasAdminRights) continue;
        for (const filename of ns.ls(hostname, ".cct")) {
            const key = `${hostname}:${filename}`;
            if (!processedContracts.has(key)) pendingContracts.push({hostname, filename, key});
        }
    }
    if (pendingContracts.length === 0) return;

    if (ns.ramOverride() < CONTRACT_RAM_REQUIRED) {
        if (!processedContracts.has("ram-warning")) {
            ns.toast(`Contracts found, but Proxxer needs ${CONTRACT_RAM_REQUIRED} GB RAM to process them.`, "warning");
            processedContracts.add("ram-warning");
        }
        return;
    }

    for (const {hostname, filename, key} of pendingContracts) {
        const contract = ns.codingcontract.getContract(filename, hostname);
        const result = runContract(ns, contract);
        processedContracts.add(key);
        if (typeof result === "string") {
            ns.write("/Proxxer/contracts.txt", `${hostname}/${filename}: ${result}\n`, "a");
        } else if (result === undefined) {
            ns.write(
                "/Proxxer/contracts.txt",
                `${hostname}/${filename}: Unsupported contract type: ${contract.type}\n`,
                "a"
            );
        }
    }
}

export function bDoorWrite(ns: NS, servers: CloudServer[]) {
    let fileContent = "";
    for (const server of servers) {
        if (!server.target.hasAdminRights || server.target.purchasedByPlayer) continue;
        if (!server.target.backdoorInstalled) fileContent += `${server.path.join(";connect ")}; backdoor\n`;
    }
    if (!ns.fileExists("backdoors.txt", "home") || fileContent !== ns.read("backdoors.txt")) {
        ns.write("backdoors.txt", fileContent, "w");
    }
}