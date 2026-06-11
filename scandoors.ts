
import { ns } from `@ns`;
export async function main(ns) {
    ns.disableLog("ALL")
    const allServers = scanAll(ns, "home");
    let rootedServers = colorize(`\n___Backdoor?___`, 50, 150, 255);
    
    for (const server of allServers) {
        if (server.sName === "home") continue;
        if (ns.hasRootAccess(server.sName)) {
            let backdoor = " --N";
            let [r, g, b] = [255, 75, 75];
            
            if (ns.getServer(server.sName).backdoorInstalled) {
                backdoor = " --Y";
                r = 75; g = 255; b = 75;
            } else {
                // Server needs backdoor - show connection path
                const path = server.path;
                const connectCommands = path.slice(1).map(s => `connect ${s}`).join(';');
                const fullCommand = `${connectCommands};backdoor`;
                backdoor = ` --N ${colorize(`home;${fullCommand}`, 255, 200, 100)}`;
            }
            
            rootedServers += colorize(`\n>${server.sName || server} ${backdoor}`, r, g, b);
        }
    }
    ns.print(rootedServers);
    ns.ui.openTail()
    ns.ui.resizeTail(500,400)
    ns.exit()
}

function scanAll(ns, start = "home") {
    const visited = new Map();
    
    function dfs(host, path = []) {
        const fullPath = [...path, host];
        visited.set(host, { sName: host, path: fullPath });
        
        for (const next of ns.scan(host)) {
            if (!visited.has(next)) {
                dfs(next, fullPath);
            }
        }
    }
    
    dfs(start);
    return [...visited.values()];
}

//color
function colorize(text, r, g, b) {
    return `${rgbToAnsiFg(r, g, b)}${text}${ANSI.reset}`;
}

function colorizeBg(text, bgR, bgG, bgB, fgR = 255, fgG = 255, fgB = 255) {
    return `${rgbToAnsiBg(bgR, bgG, bgB)}${rgbToAnsiFg(fgR, fgG, fgB)}${text}${ANSI.reset}`;
}

function tag(text, bgR, bgG, bgB, fgR = 0, fgG = 0, fgB = 0) {
    return colorizeBg(` ${text} `, bgR, bgG, bgB, fgR, fgG, fgB);
}

const ANSI = {
    reset: "\x1b[0m",
    fgRgb: (r, g, b) => `\x1b[38;2;${r};${g};${b}m`,
    bgRgb: (r, g, b) => `\x1b[48;2;${r};${g};${b}m`,
};

function clampByte(n) {
    return Math.max(0, Math.min(255, Math.round(n)));
}

function rgbToAnsiFg(r, g, b) {
    return ANSI.fgRgb(clampByte(r), clampByte(g), clampByte(b));
}

function rgbToAnsiBg(r, g, b) {
    return ANSI.bgRgb(clampByte(r), clampByte(g), clampByte(b));
}
