export function passportStamp(id: string, scene: string) {
	let seed = 2166136261;
	for (const byte of new TextEncoder().encode(`${scene}:${id}`))
		seed = Math.imul(seed ^ byte, 16777619) >>> 0;
	const motif = ['Quiet', 'Intimate'].includes(scene)
		? 'arches'
		: ['Lively', 'Brunch'].includes(scene)
			? 'rays'
			: scene === 'Adventurous'
				? 'compass'
				: 'cup';
	const rotation = (seed % 11) - 5;
	const marks = Array.from({ length: 8 }, (_, index) => {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
		return { angle: index * 45 + (seed % 13) - 6, length: 3 + (seed % 4) };
	});
	return { motif, rotation, marks };
}
