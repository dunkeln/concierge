function normalize(value: unknown): string {
	return typeof value === 'string'
		? value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
		: '';
}

export function rankPlaces<T extends { name: string; categories: string[] }>(
	places: T[],
	options: { venue?: string; cuisine?: string; preferredCuisines?: string[] }
): T[] {
	const venue = normalize(options.venue);
	const cuisine = normalize(options.cuisine).replace(/[_-]+/g, ' ');
	const preferences = (cuisine || venue ? [] : (options.preferredCuisines ?? []))
		.map((value) => normalize(value).replace(/[_-]+/g, ' '))
		.filter(Boolean);

	// ponytail: Only returned candidates can be ranked; widen retrieval if recall becomes the limit.
	return places
		.map((place, index) => {
			const leaves = new Set(
				(Array.isArray(place.categories) ? place.categories : [])
					.filter((value): value is string => typeof value === 'string')
					.map((category) => normalize(category.split('.').at(-1)).replace(/[_-]+/g, ' '))
					.filter(Boolean)
			);
			const preferenceIndex = preferences.findIndex((preference) => leaves.has(preference));
			return {
				place,
				index,
				venueMatch: !!venue && normalize(place.name) === venue,
				cuisineMatch: !!cuisine && leaves.has(cuisine),
				preferenceRank: preferenceIndex < 0 ? preferences.length : preferenceIndex
			};
		})
		.sort(
			(a, b) =>
				Number(b.venueMatch) - Number(a.venueMatch) ||
				Number(b.cuisineMatch) - Number(a.cuisineMatch) ||
				a.preferenceRank - b.preferenceRank ||
				a.index - b.index
		)
		.map(({ place }) => place);
}
