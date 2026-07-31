class Widget {
	constructor(public value: number) {}

	print(): void {
		console.error(`Widget value = ${this.value}`);
	}
}

function main(): void {
	const w: Widget | null = null;

	if (w === null) {
		console.error("Widget is null, skipping.");
	} else {
		w.print();
	}

	console.error("Program finished normally.");
}

main();
