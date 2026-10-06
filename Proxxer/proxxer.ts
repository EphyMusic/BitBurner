import { CloudServer } from "./lib/cloud";

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

function formatProxName(host: string): string {
    if (host.length > 5) {
        host = host.slice(0, 5);
    } else {
        host = host.padEnd(5, " ");
    }
    return `PRX-${host}`;
}

function scan(ns:NS,servers: CloudServer[] = []): CloudServer[] {
    const seen = new Set(servers.length > 0? servers.map(server => server.target.hostname) : []);

    for (const [host,path] of scanPaths(ns)) {
        if (host === "home" || seen.has(host)) continue;
        const cloud = CloudServer.create(ns, formatProxName(host), host, path);
        if (!cloud) break;
        seen.add(host);
        servers.push(cloud);
    }
    return servers;
}

export async function main(ns: NS) {
	
}