export async function main(ns: NS) {
	const man = "Page: used to page the unBasic script, currently just to change the display. Valid args: -r -u -p -h"
	if (ns.args.length === 0) {
		ns.tprint(man)
		ns.exit()
	}
	const page = "/unBasic/cfg/page.txt"
	switch (ns.args[0]) {
		case "-r":
			ns.write(page,"ROOT", "w");
			ns.exit();
		case "-u":
			ns.write(page,"UNROOT", "w");
			ns.exit();
		case "-p":
			ns.write(page,"PROXY", "w");
			ns.exit();
		case "-h":
			ns.write(page,"HNET", "w");
			ns.exit();
		default:
			ns.tprint(man);
			ns.exit();
	}
}