export async function main(ns:NS) {
	ns.disableLog("ALL");
	ns.ui.openTail();
	ns.ui.setTailTitle("test.ts Tail Size Monitor");
	const doc = eval("document") as Document;
	let header = [...doc.querySelectorAll(".drag")].find(
		element => element.textContent?.includes("test.ts Tail Size Monitor")
	);
	const tail = header?.parentElement;
	tail?.querySelectorAll(".MuiPaper-root").forEach(element => {
		(element as HTMLElement).style.backgroundColor = "#4a8333";
	});
	let currentColor = "#4a8333";
	while (true) {
		ns.clearLog();
		header = [...doc.querySelectorAll(".drag")].find(
			element => element.textContent?.includes("test.ts Tail Size Monitor")
		);
		const rect = header?.parentElement?.getBoundingClientRect();
		rect
		if (rect) {
			ns.print(`Tail size: ${Math.round(rect.width)} × ${Math.round(rect.height)} px`);
		} else {
			ns.print("test.ts tail not found.");
		}
		// currentColor = switchTailColor(ns, doc, currentColor);
		await ns.sleep(100);
	}
}

function switchTailColor(ns:NS,doc:Document,currentColor:string): string {
	const header = [...doc.querySelectorAll(".drag")].find(
		element => element.textContent?.includes("test.ts Tail Size Monitor")
	);
	const tail = header?.parentElement;
	switch(currentColor) {
		case "#4a8333":
			currentColor = "#20242c";
			break;
		default:
			currentColor = "#4a8333";
			break;
	}
	tail?.querySelectorAll(".MuiPaper-root").forEach(element => {
		(element as HTMLElement).style.backgroundColor = currentColor;
	});
	return currentColor;
}