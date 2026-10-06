export async function main(ns: NS) {
	ns.ramOverride(1.6)
	const man = "Page: pages unBasic script." +
	"\nSwitch display page: -r for Root Page | -u for Unroot Page | -p for Proxy Page | -h for Hacknet Page" +
	"\nCommands: --set <serverHostname> <property:state|target> <value; state: HACK | GROW | USEPROXY, target: targetHostname>"
	const page = "/unBasic/cfg/page.txt"
	const cmd = "/unBasic/cfg/cmd.txt"
	if (ns.args.length === 0) {
		ns.tprint(man)
		ns.exit()
	}
	
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

		case "--set":
			const hostname = ns.args[1];
			const property = ns.args[2];
			const value = ns.args[3];
			if (!hostname || !property || !value) {
				ns.tprint(man);
				ns.exit();
			}
			ns.write(cmd, `set|${hostname}|${property}|${value}`, "w");
			ns.exit();

		case "--read":
			const readHostname = ns.args[1];
			const readProperty = ns.args[2];
			if (!readHostname || !readProperty) {
				ns.tprint(man);
				ns.exit();
			}
			ns.write(cmd, `read|${readHostname}|${readProperty}`, "w");
			ns.exit();

		case "--exit":
			ns.write(cmd, `exit`, "w");
			ns.exit();
		
		case "--restart":
			ns.write(cmd, `exit`, "w");
			await ns.sleep(100)
			ns.ramOverride(2.6)
			ns.run('/unBasic/unbasic.ts')
			ns.exit();

		case "--hnet":
			ns.write(cmd, `toggleHnet`, "w");
			ns.exit();
			
		default:
			ns.tprint(man);
			ns.exit();

	}
}