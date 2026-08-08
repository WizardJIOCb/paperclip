import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const calendars = pgTable(
  "calendars",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    creatorUserId: text("creator_user_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    color: text("color").notNull(),
    status: text("status")
      .$type<"active" | "archived">()
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    companyStatusIdx: index("calendars_company_status_idx").on(
      table.companyId,
      table.status,
    ),
    creatorIdx: index("calendars_creator_idx").on(
      table.companyId,
      table.creatorUserId,
    ),
    statusCheck: check(
      "calendars_status_check",
      sql`${table.status} in ('active', 'archived')`,
    ),
  }),
);

export const calendarMembers = pgTable(
  "calendar_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    role: text("role")
      .$type<"creator" | "member">()
      .notNull()
      .default("member"),
    status: text("status")
      .$type<"active" | "left" | "removed">()
      .notNull()
      .default("active"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // Prevents duplicate membership of the same user in one calendar.
    calendarUserUniqueIdx: uniqueIndex(
      "calendar_members_calendar_user_unique_idx",
    ).on(table.calendarId, table.userId),
    // Drives "list calendars visible to this user in this company".
    userCompanyStatusIdx: index("calendar_members_user_company_status_idx").on(
      table.userId,
      table.companyId,
      table.status,
    ),
    calendarStatusIdx: index("calendar_members_calendar_status_idx").on(
      table.calendarId,
      table.status,
    ),
    roleCheck: check(
      "calendar_members_role_check",
      sql`${table.role} in ('creator', 'member')`,
    ),
    statusCheck: check(
      "calendar_members_status_check",
      sql`${table.status} in ('active', 'left', 'removed')`,
    ),
  }),
);

export const calendarInvitations = pgTable(
  "calendar_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    invitedUserId: text("invited_user_id"),
    invitedEmail: text("invited_email").notNull(),
    invitedByUserId: text("invited_by_user_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tokenHashUniqueIdx: uniqueIndex(
      "calendar_invitations_token_hash_unique_idx",
    ).on(table.tokenHash),
    // Partial unique: at most one *pending* invitation per (calendar, user).
    // Accepted/revoked rows stay in place so the invitation history is auditable.
    calendarUserPendingUniqueIdx: uniqueIndex(
      "calendar_invitations_calendar_user_pending_uq",
    )
      .on(table.calendarId, table.invitedUserId)
      .where(sql`invited_user_id is not null and accepted_at is null and revoked_at is null`),
    calendarEmailPendingUniqueIdx: uniqueIndex(
      "calendar_invitations_calendar_email_pending_uq",
    )
      .on(table.calendarId, table.invitedEmail)
      .where(sql`accepted_at is null and revoked_at is null`),
    invitedUserIdx: index("calendar_invitations_invited_user_idx").on(
      table.invitedUserId,
      table.expiresAt,
    ),
    calendarIdx: index("calendar_invitations_calendar_idx").on(
      table.calendarId,
      table.createdAt,
    ),
  }),
);

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id").notNull(),
    title: text("title").notNull(),
    note: text("note"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    timezone: text("timezone").notNull(),
    version: integer("version").notNull().default(1),
    scheduleVersion: integer("schedule_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    calendarRangeIdx: index("calendar_events_calendar_range_idx").on(
      table.calendarId,
      table.startsAt,
    ),
    companyRangeIdx: index("calendar_events_company_range_idx").on(
      table.companyId,
      table.startsAt,
    ),
    // Range queries also filter on ends_at for events that span the window start.
    calendarEndsAtIdx: index("calendar_events_calendar_ends_at_idx").on(
      table.calendarId,
      table.endsAt,
    ),
  }),
);

export const eventReminders = pgTable(
  "event_reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => calendarEvents.id, { onDelete: "cascade" }),
    recipientUserId: text("recipient_user_id").notNull(),
    scheduleVersion: integer("schedule_version").notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    status: text("status")
      .$type<
        "pending" | "retry" | "sending" | "sent" | "cancelled" | "failed"
      >()
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", {
      withTimezone: true,
    }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // At most one reminder per (event, recipient, schedule version) — the core
    // idempotency guarantee. Re-running the scheduler cannot create duplicates.
    eventRecipientVersionUniqueIdx: uniqueIndex(
      "event_reminders_event_recipient_version_unique_idx",
    ).on(table.eventId, table.recipientUserId, table.scheduleVersion),
    // Partial index: the delivery worker only ever scans deliverable rows.
    pendingDeliveryIdx: index("event_reminders_pending_delivery_idx")
      .on(table.nextAttemptAt)
      .where(sql`status in ('pending', 'retry')`),
    eventStatusIdx: index("event_reminders_event_status_idx").on(
      table.eventId,
      table.status,
    ),
    statusCheck: check(
      "event_reminders_status_check",
      sql`${table.status} in ('pending', 'retry', 'sending', 'sent', 'cancelled', 'failed')`,
    ),
  }),
);

/**
 * Per-user notification settings.
 *
 * Paperclip's better-auth `user` table has no timezone or notification
 * columns, so reminder delivery needs its own home for them. Absent row =
 * reminders enabled, UTC — so existing users keep working without a backfill.
 */
export const userNotificationPreferences = pgTable(
  "user_notification_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    timezone: text("timezone").notNull().default("UTC"),
    eventRemindersEnabled: boolean("event_reminders_enabled")
      .notNull()
      .default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userUniqueIdx: uniqueIndex("user_notification_preferences_user_uq").on(
      table.userId,
    ),
  }),
);
