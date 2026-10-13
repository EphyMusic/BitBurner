export async function main(ns:NS) {
    if (ns.args.length < 1) return;
    const target = ns.args[0] as string;
    const delay = ns.args[1] as number;
    await ns.grow(target,{additionalMsec: delay});
}