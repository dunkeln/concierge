export type MenuItem = {
	id: string;
	name: string;
	description?: string;
	price?: string;
	section?: string;
	evidence: string;
};

export type Menu = {
	kind: 'menu';
	restaurant: string;
	area: string;
	sourceUrl: string;
	checkedAt: string;
	items: MenuItem[];
};

export type DishSelection = {
	id: string;
	name: string;
	restaurant: string;
	area: string;
	sourceUrl: string;
	selectedAt: string;
};
