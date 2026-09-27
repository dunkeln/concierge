import { pgTable, integer, text, timestamp, date, index } from 'drizzle-orm/pg-core';
import { user } from './auth.schema';

export const userProfile = pgTable('user_profile', {
	userId: text('user_id')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	cuisines: text('cuisines').array().notNull(),
	atmospheres: text('atmospheres').array().notNull(),
	budget: text('budget').notNull(),
	travelMinutes: integer('travel_minutes').notNull(),
	priorVersion: integer('prior_version').notNull().default(1),
	onboardedAt: timestamp('onboarded_at', { withTimezone: true }).notNull()
});

export const passportVisit = pgTable(
	'passport_visit',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		place: text('place').notNull(),
		visitedOn: date('visited_on', { mode: 'string' }).notNull(),
		scene: text('scene').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [index('passport_visit_user_date_idx').on(table.userId, table.visitedOn)]
);

export * from './auth.schema';
