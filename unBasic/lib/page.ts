export async function main(ns: NS) {
	const man = "Page: used to page the unBasic script, currently just to change the display. Valid args: -r -u -p"
	if (ns.args.length === 0) {
		ns.tprint(man)
		ns.exit()
	}

	switch (ns.args[0]) {
		case "-r":
			ns.write("/unBasic/cfg/page.txt","ROOT", "w");
			ns.exit();
		case "-u":
			ns.write("/unBasic/cfg/page.txt","UNROOT", "w");
			ns.exit();
		case "-p":
			ns.write("/unBasic/cfg/page.txt","PROXY", "w");
			ns.exit();
		default:
			ns.tprint(man);
			ns.exit();
	}
}