// ANSI color helpers
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

export function constructSpinner(seed = Math.random()) {
    const spinners = [
        [`◴`, `◷`, `◶`, `◵`],
        [`▁`, `▂`, `▃`, `▄`, `▅`, `▆`, `▇`, `█`, `▇`, `▆`, `▅`, `▄`, `▃`, `▁`],
        [`▉`, `▊`, `▋`, `▌`, `▍`, `▎`, `▏`, `▎`, `▍`, `▌`, `▋`, `▊`, `▉`],
        [`⣾`, `⣽`, `⣻`, `⢿`, `⡿`, `⣟`, `⣯`, `⣷`],
        [`⠁`, `⠂`, `⠄`, `⡀`, `⢀`, `⠠`, `⠐`, `⠈`, `⠈`, `⠐`, `⠠`, `⢀`, `⡀`, `⠄`, `⠂`, `⠁`],
        [`┤`, `┘`, `┴`, `└`, `├`, `┌`, `┬`, `┐`],
        [`▖`, `▘`, `▝`, `▗`],
        [`◢`, `◣`, `◤`, `◥`],
        [`◰`, `◳`, `◲`, `◱`],
        [`◐`, `◓`, `◑`, `◒`]
    ];
    const s = Math.max(0, Math.min(0.999999, Number(seed) || 0));
    const idx = Math.floor(s * spinners.length);
    return spinners[idx];
}

export function initTail(ns: NS, title?: string, width?: number, height?: number, fontSize?: number,et?:Function) {
    ns.disableLog("ALL");
    ns.ui.openTail();
    ns.ui.setTailTitle(title ?? "Test");
    const [x, y] = ns.ui.windowSize();
    ns.ui.resizeTail(width ?? x / 7, height ?? y / 7);
    ns.ui.setTailFontSize(fontSize ?? 14);
    ns.ui.moveTail(x - (width ?? x / 7), 0);
    ns.ui.renderTail();
    ns.atExit(() => et ? et : exitTasks(ns));
}

function scan(ns: NS, start = "home"): string[] {
    const visited = new Set<string>();

    function dfs(host: string) {
        visited.add(host);
        for (const next of ns.scan(host)) {
            if (!visited.has(next)) dfs(next);
        }
    }

    dfs(start);

    const servers: string[] = [];
    for (const hostname of visited) {
        if (hostname === "home") continue;
        if (ns.getServer(hostname).isOnline !== undefined) continue;
        servers.push(hostname);
    }
    return servers;
}


function exitTasks(ns: NS) {
    const servers = scan(ns, "home");
    ns.ui.closeTail();
    for (const s of servers) {
        if (s == "home") continue;
        const procs = ns.ps(s);
        if (procs.length > 0) {
            ns.tprint(colorize(`Killing script on ${colorize(s, 0, 255, 255)}`, 150, 255, 100));
            for (const proc of procs) {
                ns.kill(proc.pid);
            }
        }
    }
}