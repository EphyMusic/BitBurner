import { ns } from '@ns';

export async function main(ns) {
    await initTail(ns,"MonitorV1",470,565); //boot up 
    ns.atExit(() => exitTasks(ns))
    checkFiles(ns);
    if (ns.getServerMaxRam("home") - ns.getServerUsedRam("home") >= ns.getScriptRam("monitorSelf.js")) {
        ns.exec("monitorSelf.js","home");
    }
    const serverFlags = Object.create(null);
    const updateFade = Object.create(null); // server -> last updated timestamp (ms)
    const unrootWindow = 10;
    let lastRootedLines = -1;
    const tailWidth = 470;
    while (true) {
        const rootedServers = runRootServers(ns, serverFlags, updateFade);
        const unrootedServers = runUnrootServers(ns, unrootWindow);

        const shouldResize = rootedServers.length !== lastRootedLines;
        if (shouldResize) lastRootedLines = rootedServers.length;

        display(ns, rootedServers, unrootedServers, shouldResize, tailWidth);
        await ns.sleep(100);
    }
}

function checkFiles(ns) {
    if (!ns.fileExists("weaken.js","home")||!ns.fileExists("grow.js","home")||!ns.fileExists("hack.js","home")) {
        ns.tprint("ERROR: Core files missing. Please ensure you have these files:\n- weaken.js\n- grow.js\n- hack.js")
        ns.exit()
    }
}

function display(ns, rooted, unrooted, shouldResize = false, tailWidth = 470) {
    ns.clearLog();

    const rootHeader = formatHeader(ROOT_COLS);
    const unrootHeader = formatHeader(UNROOT_COLS);

    const printRoot = rooted.join("\n");
    const printUnroot = unrooted.join("\n");

    const body =
        `${rootHeader}\n` +
        `${printRoot}\n\n` +
        `${unrootHeader}\n` +
        `${printUnroot}`;

    ns.print(body);

    if (shouldResize) {
        const lineCount = body.split("\n").length;
        const lineHeight = 19; // tuned for fontSize ~14
        const extraLines = 2; // prevents bottom clipping
        const padding = 50 + (extraLines * lineHeight);
        const minHeight = 200;
        const desiredHeight = Math.max(minHeight, (lineCount * lineHeight) + padding);
        ns.ui.resizeTail(tailWidth, desiredHeight);
    }

    ns.ui.renderTail();
}


function runRootServers(ns, serverFlags, updateFade) {
    const weakenScript = "weaken.js";
    const growScript = "grow.js";
    const hackScript = "hack.js";
    const shareScript = "share.js";
    const rootedServers = getRootedServers(ns).sort((a, b) => a.localeCompare(b));

    const now = Date.now();
    const FADE_MS = 1000;
    const UPDATE_RGB = { r: 175, g: 255, b: 255 };
    const FADE_TO_RGB = { r: 155, g: 155, b: 240 };

    function actionRank(actionText) {
        const t = String(actionText ?? "").toLowerCase();
        if (t.startsWith("hack")) return 0;
        if (t.startsWith("grow")) return 1;
        if (t.startsWith("weak")) return 2;
        if (t.startsWith("shar")) return 3;
        return 4;
    }

    const allRows = [];
    for (const server of rootedServers) {
        if (serverFlags[server] === undefined) serverFlags[server] = false;

        const maxMoney = ns.getServerMaxMoney(server);
        const curMoney = ns.getServerMoneyAvailable(server);
        const maxRam = ns.getServerMaxRam(server);
        const freeRam = maxRam - ns.getServerUsedRam(server);
        const minSecurity = ns.getServerMinSecurityLevel(server);
        const curSecurity = ns.getServerSecurityLevel(server);

        let bUpdated = false;
        let action;
        const secThreshold = minSecurity * 1.5;
        const monThreshold = maxMoney / 10;

        const procs = ns.ps(server);

        if (curMoney === maxMoney) serverFlags[server] = false;

        if (procs.length == 0) {
            let threads;
            switch (true) {
                case maxMoney === 0:
                    ns.scp(shareScript, server, "home");
                    threads = Math.floor(freeRam / ns.getScriptRam(shareScript, "home"));
                    if (threads === 0 || !Number.isFinite(threads)) break;
                    ns.exec(shareScript, server, threads, server);
                    bUpdated = true;
                    action = "sharing..."
                    break;

                case curSecurity >= secThreshold:
                    ns.scp(weakenScript, server, "home");
                    threads = Math.floor(freeRam / ns.getScriptRam(weakenScript, "home"));
                    if (threads === 0 || !Number.isFinite(threads)) break;
                    ns.exec(weakenScript, server, threads, server, minSecurity);
                    bUpdated = true;
                    action = "weakening...";
                    break;

                case curMoney <= monThreshold || serverFlags[server]:
                    serverFlags[server] = true;
                    ns.scp(growScript, server, "home");
                    threads = Math.floor(freeRam / ns.getScriptRam(growScript, "home"));
                    if (threads === 0 || !Number.isFinite(threads)) break;
                    bUpdated = true;
                    ns.exec(growScript, server, threads, server, secThreshold, maxMoney);
                    action = "growing...";
                    break;

                default:
                    ns.scp(hackScript, server, "home");
                    threads = Math.floor(freeRam / ns.getScriptRam(hackScript, "home"));
                    if (threads === 0 || !Number.isFinite(threads)) break;
                    bUpdated = true;
                    ns.exec(hackScript, server, threads, server, secThreshold, monThreshold);
                    action = "hacking...";
                    break;
            }
        }
        const procAction =
            procs.length > 0
            ? (procs[0].filename === "share.js"
                ? "sharing..."
                : procs[0].filename.replace(".js", "ing..."))
            : "waiting...";


        const row = formatRow(
            [server, `$${ns.format.number(curMoney,1)}/$${ns.format.number(maxMoney,1)}`, `${minSecurity}/${ns.format.number(curSecurity,3,1000000)}`, action ?? procAction],
            ROOT_COLS
        );

        if (bUpdated) updateFade[server] = now;

        const last = updateFade[server];
        const t = last === undefined ? 1 : clamp01((now - last) / FADE_MS);
        const fadedRgb = lerpRgb(UPDATE_RGB, FADE_TO_RGB, t);
        const fadedRow = (last === undefined) ? row : colorize(row, fadedRgb.r, fadedRgb.g, fadedRgb.b);

        allRows.push({
            row: fadedRow,
            rank: actionRank(action ?? procAction),
            server,
        });
    }

    allRows.sort((a, b) => (a.rank - b.rank) || a.server.localeCompare(b.server));
    const sortedRows = allRows.map(r => r.row);

    return sortedRows;
}

function runUnrootServers(ns, windowSize = 10) {
    const entries = getUnrootedServers(ns)
        .map(server => ({ server, reqHack: ns.getServerRequiredHackingLevel(server) }))
        .sort((a, b) => a.reqHack - b.reqHack);

    const blankRow = formatRow(["", ""], UNROOT_COLS);
    const size = Math.max(1, Math.floor(windowSize));
    const pageItems = entries.slice(0, size);

    const output = [];
    for (const item of pageItems) {
        const row = formatRow([item.server, String(item.reqHack)], UNROOT_COLS);

        if (_canRoot(ns, item.server)) {
            if (_crackPorts(ns, item.server)) {
                _nukeServer(ns, item.server);
                output.push(colorize(row, 125, 255, 125));
            } else {
                output.push(colorize(row, 255, 255, 150));
            }
        } else {
            output.push(colorize(row, 255, 155, 155));
        }
    }

    while (output.length < size) output.push(blankRow);
    return output;
}

function getRootedServers(ns) {
    const allServers = scanAll(ns,"home");
    let rootedServers = [];
    for (const server of allServers) {
        if (server === "home") continue;
        if (ns.hasRootAccess(server)) {
            rootedServers.push(server);
        }
    }
    return rootedServers
}

function getUnrootedServers(ns) {
    const allServers = scanAll(ns,"home");
    const unrootedServers = [];
    for (const server of allServers) {
        if (server === "home") continue;
        if (!ns.hasRootAccess(server)) {
            unrootedServers.push(server);
        }
    }
    return unrootedServers
}

function scanAll(ns,start) {
    const visited = new Set();

    function dfs(host) {
        visited.add(host);
        for (const next of ns.scan(host)) {
            if (!visited.has(next)) dfs(next);
        }
    }
    dfs(start??"home");
    return [...visited];
}

function _canRoot(ns,server) {
    const requiredLevel = ns.getServerRequiredHackingLevel(server);
    if (ns.getHackingLevel() >= requiredLevel) return true;
    return false;
}

function _nukeServer(ns,server) {
    return ns.nuke(server)
}

function _crackPorts(ns,server) {
    const attacks = {"BruteSSH.exe":ns.brutessh, "FTPCrack.exe":ns.ftpcrack, "relaySMTP.exe":ns.relaysmtp, "HTTPWorm.exe":ns.httpworm,"SQLInject.exe":ns.sqlinject};
    let openPorts = 0;
    const reqPorts = ns.getServerNumPortsRequired(server);
    for (const [file,fn] of Object.entries(attacks)) {
        if (openPorts >= reqPorts) return true;
        if (!ns.fileExists(file,"home")) return false;
        fn(server);
        openPorts++;
    }
    return false
}


//Startup Utils
export async function initTail(ns,title,width,height,fontSize) {
    ns.disableLog("ALL");
    ns.ui.openTail();
    await boot(ns);
    ns.ui.setTailTitle(title ?? "MonitorV1");
    const[x,y] = ns.ui.windowSize();
    ns.ui.resizeTail(width ?? x/7,height ?? y/7);
    ns.ui.setTailFontSize(fontSize??14);
    ns.ui.moveTail(x-width,0);
    ns.ui.renderTail();
    ns.atExit(ns.ui.closeTail);
}


export async function boot(ns) {
    const stages = [
`////////////////




,,,,,,,,,,,,,,,,`,
`////////////////

>


,,,,,,,,,,,,,,,,`,
`////////////////

'>


,,,,,,,,,,,,,,,,`,
`////////////////
>
)'>


,,,,,,,,,,,,,,,,`,
`////////////////
>
))'>

>
,,,,,,,,,,,,,,,,`,
`////////////////
'>
>))'>

)'>
,,,,,,,,,,,,,,,,`,
`////////////////
'>
 >))'>

>))'>
,,,,,,,,,,,,,,,,`,
`////////////////
)'>
  >))'>

  >))'>
,,,,,,,,,,,,,,,,`,
`////////////////
))'>
   >))'>

    >))'>
,,,,,,,,,,,,,,,,`,
`////////////////
>))'>
    >))'>

      >))'>
,,,,,,,,,,,,,,,,`,
`////////////////
>))'>
     >))'>

        >))'>
,,,,,,,,,,,,,,,,`,
`////////////////
 >))'>
      >))'>

          >))'>
,,,,,,,,,,,,,,,,`,
`////////////////
 >))'>
       >))'>

            >))'
,,,,,,,,,,,,,,,,`,
`////////////////
  >))'>
        >))'>

              >)
,,,,,,,,,,,,,,,,`,
`////////////////
  >))'>
         >))'>

              
,,,,,,,,,,,,,,,,`,
`////////////////
   >))'>
          >))'>

              
,,,,,,,,,,,,,,,,`,
`////////////////
   >))'>
           >))'>

              
,,,,,,,,,,,,,,,,`,
`////////////////
   >))'>
            >))'

              
,,,,,,,,,,,,,,,,`,
`////////////////
    >))'>
             >))

              
,,,,,,,,,,,,,,,,`,
`////////////////
    >))'>
              >)

              
,,,,,,,,,,,,,,,,`,
`////////////////
    >))'>
               >

              
,,,,,,,,,,,,,,,,`,
`////////////////
    >))'>
               
n
              
,,,,,,,,,,,,,,,,`,
`////////////////
    >))'>
               
in
              
,,,,,,,,,,,,,,,,`,
`////////////////
    >))'>
               
ain
              
,,,,,,,,,,,,,,,,`,
`////////////////
     >))'>
               
Lain
              
,,,,,,,,,,,,,,,,`,
`////////////////
      >))'>
               
 Lain
              
,,,,,,,,,,,,,,,,`,
`////////////////
        >))'>
               
  Lain
              
,,,,,,,,,,,,,,,,`,
`////////////////
          >))'>
               
   Lain
              
,,,,,,,,,,,,,,,,`,
`////////////////
            >))'
               
    Lain
              
,,,,,,,,,,,,,,,,`,
`////////////////
              >)
               
     Lain
              
,,,,,,,,,,,,,,,,`,
`////////////////
              
               
      Lain
              
,,,,,,,,,,,,,,,,`,
`////////////////
              
               
      Lain
              
,,,,,,,,,,,,,,,,`,
`////////////////
              
               
      Lain
              
,,,,,,,,,,,,,,,,`,
`////////////////
              
               
      Lain
              
,,,,,,,,,,,,,,,,`,
`////////////////
              
               
      Lain
              
,,,,,,,,,,,,,,,,`
    ]
    function colorStage(stage) {
        let alt = stage.replace("////////////////",colorize("////////////////",20,50,255));
        alt = alt.replace(",,,,,,,,,,,,,,,,",colorize(",,,,,,,,,,,,,,,,",20,255,50));
        alt = alt.replaceAll(">", colorize(">",255,50,100))
        alt = alt.replaceAll("'", colorize("'",255,255,255))
        alt = alt.replaceAll(")", colorize(")",255,50,175))
        return alt
    }
    ns.ui.setTailFontSize(22)
    ns.ui.resizeTail(200,220)
    let x = ""
    for (const stage of stages) {
        ns.ui.setTailTitle("Booting" + x)
        ns.clearLog()
        ns.print(colorStage(stage))
        ns.ui.renderTail()
        await ns.sleep(150)
        x.length >= 3 ? x = "" : x += "."
    }
}

function exitTasks(ns) {
    const servers = getRootedServers(ns);
    ns.ui.closeTail();
    for (const server of servers) {
        ns.tprint(colorize(`${server}:Killing scripts...`,25,175,255));
        ns.killall(server);
    }
    ns.tprint(colorize("home:Killing Scripts...",25,175,255))
    ns.killall("home",true)
    ns.tprint(colorize("Monitor shutting down...",100,255,100));
}

//Color Util
function colorize(text, r, g, b) {
  return `${rgbToAnsiFg(r, g, b)}${text}${ANSI.reset}`;
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

function clamp01(t) {
    const n = Number(t);
    if (!Number.isFinite(n)) return 1;
    return Math.max(0, Math.min(1, n));
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function lerpRgb(from, to, t) {
    const tt = clamp01(t);
    return {
        r: clampByte(lerp(from.r, to.r, tt)),
        g: clampByte(lerp(from.g, to.g, tt)),
        b: clampByte(lerp(from.b, to.b, tt)),
    };
}

//Format Utils
function stripAnsi(s) {
    return String(s).replace(/\x1b\[[0-9;]*m/g, "");
}
function visibleLen(s) {
    return stripAnsi(s).length;
}
function padVisible(s, width, align = "left") {
    s = String(s ?? "");
    const len = visibleLen(s);
    const n = Math.max(0, width - len);
    if (align === "right") return " ".repeat(n) + s;
    if (align === "center") {
        const left = Math.floor(n / 2);
        const right = n - left;
        return " ".repeat(left) + s + " ".repeat(right);
    }
    return s + " ".repeat(n); // left
}
function formatRow(cells, cols) {
    const parts = cells.map((c, i) => padVisible(c, cols[i].w, cols[i].align));    // cols: [{ w, align }]
    return parts.join("|");
}
function formatHeader(cols) {
    const labelRow = formatRow(cols.map(c => c.label), cols);
    const underlineRow = cols.map(c => "_".repeat(c.w)).join("|");
    return `${labelRow}\n${underlineRow}`;
}
function pageSlice(items, pageIndex = 0, windowSize = 10) {
    const len = items.length;
    const size = Math.max(1, Math.floor(windowSize));

    if (len === 0) return { pageItems: [], size };

    const pageCount = Math.max(1, Math.ceil(len / size));
    const page = ((Math.floor(pageIndex) % pageCount) + pageCount) % pageCount;

    const start = page * size;
    const pageItems = items.slice(start, start + size);
    return { pageItems, size };
}

const ROOT_COLS = [
    { label: "Server", w: 19, align: "left" },
    { label: "Money",  w: 15, align: "left" },
    { label: "Security", w:10, align: "left" },
    { label: "Action", w: 12, align: "left" },
];

const UNROOT_COLS = [
    { label: "Server",        w: 42, align: "left" },
    { label: "Hacking Level", w: 17, align: "left" },
];
