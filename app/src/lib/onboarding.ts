export const atmospheres = ['Quiet', 'Lively', 'Intimate', 'Casual', 'Adventurous'] as const;
export const scenarios = [
	{
		atmosphere: 'Quiet',
		title: 'A slow dinner where we can catch up',
		detail: 'Good conversation, no rush.'
	},
	{
		atmosphere: 'Lively',
		title: 'A celebration worth going out for',
		detail: 'Energy, friends, and one more round.'
	},
	{
		atmosphere: 'Intimate',
		title: 'A date night for just the two of us',
		detail: 'Somewhere that feels a little special.'
	},
	{
		atmosphere: 'Casual',
		title: 'An easy dinner after a long day',
		detail: 'Comfortable, simple, and close by.'
	},
	{
		atmosphere: 'Adventurous',
		title: 'Surprise me with somewhere new',
		detail: 'A place I might not pick myself.'
	},
	{
		atmosphere: 'Brunch',
		title: 'A long weekend brunch',
		detail: 'Good food and no need to rush.'
	},
	{
		atmosphere: 'Coffee',
		title: 'Coffee and a proper catch-up',
		detail: 'A café where we can settle in.'
	}
] as const;
export const travelMinutes = [15, 30, 60] as const;
