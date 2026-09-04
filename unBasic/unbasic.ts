// import { NS, Server } from "@ns";
import { ScannedServer, bDoorWrite } from "./lib/server";
// import { ProxyServer } from "./lib/cloud";
import { colorize, initTail } from "./lib/common";

type SpinnerInfo = {
    spinner: string[];
    r: number;
    g: number;
    b: number;
};

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

function makeGroup(servers: string[], limit = 5): string[][] {
    const fullGroup: string[][] = [];
    let group: string[] = [];
    let x = 0;

    for (const server of servers) {
        if (x >= limit) {
            x = 0;
            fullGroup.push(group);
            group = [];
        }
        group.push(server);
        x += 1;
    }

    if (group.length < limit) {
        while (group.length < limit) group.push("");
    }

    fullGroup.push(group);
    return fullGroup;
}

function formatGroups(ns: NS, servers: ScannedServer[], limit = 5, dt: number): string[][][] {
    const root: string[] = [];
    const unroot: string[] = [];
    const rootServers: ScannedServer[] = [];
    const unrootServers: ScannedServer[] = [];

    for (const server of servers) {
        if (server.server.hasAdminRights) rootServers.push(server);
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

    unrootServers.sort((a, b) => {
        const aSkill = a.server.requiredHackingSkill ?? 0;
        const bSkill = b.server.requiredHackingSkill ?? 0;
        return aSkill - bSkill;
    });

    for (const server of rootServers) root.push(server.output(ns, dt));
    for (const server of unrootServers) unroot.push(server.output(ns, dt));

    const rootGroups = makeGroup(root, limit * 1.5);
    const unrootGroups = makeGroup(unroot, limit / 2);
    return [rootGroups, unrootGroups];
}

function display(ns: NS, servers: ScannedServer[], groupChangeInterval: number, spinner: SpinnerInfo, frame: number, dt: number) {
    const sprite = spinner.spinner;
    const groups = formatGroups(ns, servers, 10, dt);
    const rootGroups = groups[0];
    const unrootGroups = groups[1];

    const elapsedMs = servers[0]?.timeActive ?? 0;
    const tick = Math.floor(elapsedMs / (groupChangeInterval * 1000));
    const rGroupSel = rootGroups.length > 0 ? Math.floor(tick % rootGroups.length) : 0;
    const unGroupSel = unrootGroups.length > 0 ? Math.floor(tick % unrootGroups.length) : 0;

    ns.print(`${colorize(sprite[frame], spinner.r, spinner.g, spinner.b)}`);

    if (rootGroups.length > 0) {
        ns.print(`Root [${rGroupSel + 1}/${rootGroups.length}]`);
        for (const entry of rootGroups[rGroupSel]) ns.print(`${entry}\n`);
    } else {
        ns.print("(none)\n");
    }

    if (unrootGroups.length > 0) {
        ns.print(`Unroot [${unGroupSel + 1}/${unrootGroups.length}]`);
        for (const entry of unrootGroups[unGroupSel]) ns.print(`${entry}\n`);
    } else {
        ns.print("(none)\n");
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

export async function main(ns: NS) {
    /// Basic Module 7.10GB
    // ns.ramOverride(7.2)
    // if (9.35 <= ns.getServerMaxRam("home")) {
    //     ns.tprint("Everything fits")
    //     ns.ramOverride();
    // } else {
    //     ns.tprint("Running basic")
    //     ns.ramOverride(7.10);
    // }

    initTail(ns, "unBasic", 560, 450, 12);
    const servers = scan(ns, "home");
    const groupChangeInterval = 5;
    const spinner: SpinnerInfo = { spinner: constructSpinner(), r: 15, g: 255, b: 255 };
    let frame = 0;
    let cycles = 0;
    const clockServer = servers[0];
    let lastTimeSource = Date.now();

    while (true) {
        scanLite(ns, servers, "home");
        const now = Date.now();
        const dt = now - lastTimeSource;
        lastTimeSource = now;

        if (clockServer) clockServer.timeActive += dt;
        const needProxy:ScannedServer[] = []
        const isProxy:ScannedServer[] = []
        for (const server of servers) {
            if (server.state === "USEPROXY") {
                needProxy.push(server);
                continue;
            } else if (server.state === "PROXY") {
                isProxy.push(server);
                continue;
            }
            server.normalizeColor();
            server.runSelf(ns);
        }
        const pairCount = Math.min(needProxy.length, isProxy.length);
        for (let i = 0;i < pairCount;i++) {
            if (isProxy[i].target === "N/A") {
                isProxy[i].target = needProxy[i].server.hostname
            }
        }
        for (const prox of isProxy) {
            prox.runSelf(ns)
        }
        

        ns.clearLog();
        display(ns, servers, groupChangeInterval, spinner, frame, dt);
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
