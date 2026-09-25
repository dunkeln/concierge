import { pgTable, integer, text, timestamp } from 'drizzle-orm/pg-core';
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

export * from './auth.schema';
