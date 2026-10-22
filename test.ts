export async function main(ns: NS) {
    const now = new Date();
    const timeZone = "America/Los_Angeles";
    const dateParts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(now);
    const year = dateParts.find((part) => part.type === "year")?.value;
    const month = dateParts.find((part) => part.type === "month")?.value;
    const day = dateParts.find((part) => part.type === "day")?.value;
    if (!year || !month || !day) {
        throw new Error("Unable to format the archive date.");
    }
    const datePart = `${year}-${month}-${day}`;
    const timePart = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
    })
        .format(now)
        .replace(/:/g, "-")
        .replace(/\s/g, "");
    for (let log of ns.ls("home","/unBasic/logs/")) {
        log = log.replace("unBasic/logs/","");
        ns.tprint(`Processing log: ${log}`)
        await ns.sleep(100)
        const newLog = `unBasic/logs/archive/${datePart}/${timePart}-${log}`
        ns.tprint(`${log} is now ${newLog}`)
    }
}