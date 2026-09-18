export async function main(ns: NS) {
	const man = "Page: pages unBasic script." +
	"\nSwitch display page: -r for Root Page | -u for Unroot Page | -p for Proxy Page | -h for Hacknet Page" +
	"\nCommands: --set <serverHostname> <property:state|target> <value; state: HACK | GROW | USEPROXY, target: targetHostname>"
	if (ns.args.length === 0) {
		ns.tprint(man)
		ns.exit()
	}
	const page = "/unBasic/cfg/page.txt"
	const cmd = "/unBasic/cfg/cmd.txt"
	switch (ns.args[0]) {
		case "-r":
			ns.write(page,"ROOT", "w");
			// ns.tprint("Switched to Root Page");
			ns.exit();
		case "-u":
			ns.write(page,"UNROOT", "w");
			// ns.tprint("Switched to Unroot Page");
			ns.exit();
		case "-p":
			ns.write(page,"PROXY", "w");
			// ns.tprint("Switched to Proxy Page");
			ns.exit();
		case "-h":
			ns.write(page,"HNET", "w");
			// ns.tprint("Switched to Hacknet Page");
			ns.exit();
		case "--set":
			const hostname = ns.args[1];
			const property = ns.args[2];
			const value = ns.args[3];
			if (!hostname || !property || !value) {
				ns.tprint(man);
				ns.exit();
			}
			ns.write(cmd, `set|${hostname}|${property}|${value}`, "w");
			// ns.tprint(`Set command issued for server: ${hostname}\nproperty: ${property}\nvalue: ${value}`);
			ns.exit();
		case "--read":
			const readHostname = ns.args[1];
			const readProperty = ns.args[2];
			if (!readHostname || !readProperty) {
				ns.tprint(man);
				ns.exit();
			}
			ns.write(cmd, `read|${readHostname}|${readProperty}`, "w");
			// ns.tprint(`Read command issued for server: ${readHostname}\nproperty: ${readProperty}`);
			// ns.tprint(ns.read(cmd))
			ns.exit();
		default:
			ns.tprint(man);
			ns.exit();
	}
}