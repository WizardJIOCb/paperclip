import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const calendars = pgTable("calendars", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  creatorUserId: text("creator_user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  companyStatusIdx: index("calendars_company_status_idx").on(table.companyId, table.status),
  creatorIdx: index("calendars_creator_idx").on(table.companyId, table.creatorUserId),
}));

export const calendarMembers = pgTable("calendar_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  calendarId: uuid("calendar_id").notNull().references(() => calendars.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  role: text("role").notNull().default("member"),
  status: text("status").notNull().default("active"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  calendarUserUniqueIdx: uniqueIndex("calendar_members_calendar_user_unique_idx").on(table.calendarId, table.userId),
  userCompanyStatusIdx: index("calendar_members_user_company_status_idx").on(table.userId, table.companyId, table.status),
  calendarStatusIdx: index("calendar_members_calendar_status_idx").on(table.calendarId, table.status),
}));

export const calendarInvitations = pgTable("calendar_invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  calendarId: uuid("calendar_id").notNull().references(() => calendars.id, { onDelete: "cascade" }),
  invitedUserId: text("invited_user_id").notNull(),
  invitedEmail: text("invited_email").notNull(),
  invitedByUserId: text("invited_by_user_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tokenHashUniqueIdx: uniqueIndex("calendar_invitations_token_hash_unique_idx").on(table.tokenHash),
  calendarUserUniqueIdx: uniqueIndex("calendar_invitations_calendar_user_unique_idx").on(table.calendarId, table.invitedUserId),
  invitedUserIdx: index("calendar_invitations_invited_user_idx").on(table.invitedUserId, table.expiresAt),
}));

export const calendarEvents = pgTable("calendar_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  calendarId: uuid("calendar_id").notNull().references(() => calendars.id, { onDelete: "cascade" }),
  authorUserId: text("author_user_id").notNull(),
  title: text("title").notNull(),
  note: text("note"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  timezone: text("timezone").notNull(),
  version: integer("version").notNull().default(1),
  scheduleVersion: integer("schedule_version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  calendarRangeIdx: index("calendar_events_calendar_range_idx").on(table.calendarId, table.startsAt),
  companyRangeIdx: index("calendar_events_company_range_idx").on(table.companyId, table.startsAt),
}));

export const eventReminders = pgTable("event_reminders", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  eventId: uuid("event_id").notNull().references(() => calendarEvents.id, { onDelete: "cascade" }),
  recipientUserId: text("recipient_user_id").notNull(),
  scheduleVersion: integer("schedule_version").notNull(),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  eventRecipientVersionUniqueIdx: uniqueIndex("event_reminders_event_recipient_version_unique_idx").on(
    table.eventId,
    table.recipientUserId,
    table.scheduleVersion,
  ),
  pendingDeliveryIdx: index("event_reminders_pending_delivery_idx").on(table.status, table.nextAttemptAt),
  eventStatusIdx: index("event_reminders_event_status_idx").on(table.eventId, table.status),
}));
