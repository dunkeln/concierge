import {
	pgTable,
	integer,
	text,
	timestamp,
	date,
	index,
	jsonb,
	primaryKey
} from 'drizzle-orm/pg-core';
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

export const chatThread = pgTable(
	'chat_thread',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
		revision: integer('revision').notNull().default(0),
		turnToken: text('turn_token'),
		busyUntil: timestamp('busy_until', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [index('chat_thread_user_updated_idx').on(table.userId, table.updatedAt)]
);

export const chatMessage = pgTable(
	'chat_message',
	{
		threadId: text('thread_id')
			.notNull()
			.references(() => chatThread.id, { onDelete: 'cascade' }),
		id: text('id').notNull(),
		position: integer('position').notNull(),
		message: jsonb('message').$type<import('ai').UIMessage>().notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		primaryKey({ columns: [table.threadId, table.id] }),
		index('chat_message_thread_position_idx').on(table.threadId, table.position)
	]
);

export * from './auth.schema';
