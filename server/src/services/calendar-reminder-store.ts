import { and, eq, inArray, isNull, lte, gt, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "@paperclipai/db";
import {
  authUsers,
  calendarEvents,
  calendarMembers,
  calendars,
  companyMemberships,
  eventReminders,
  userNotificationPreferences,
} from "@paperclipai/db";

const CLAIM_STATUSES = ["pending", "retry"] as const;
const DEFAULT_TIMEZONE = "UTC";

export interface CalendarReminderPayload {
  id: string;
  eventId: string;
  calendarId: string;
  companyId: string;
  recipientUserId: string;
  recipientEmail: string;
  recipientName: string | null;
  recipientTimezone: string;
  attempts: number;
  scheduleVersion: number;
  calendarName: string;
  eventTitle: string;
  eventNote: string | null;
  eventStartsAt: Date;
  eventStartsAtLocal: string;
  eventTimezone: string;
  authorName: string | null;
  eventUrl: string | null;
}

function formatLocalStart(startsAt: Date, timezone: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(startsAt);
}

function eventUrl(publicUrl: string | undefined, eventId: string) {
  if (!publicUrl) return null;
  return `${publicUrl.replace(/\/+$/, "")}/notes?eventId=${encodeURIComponent(eventId)}`;
}

export function calendarReminderStore(db: Db, deps: { publicUrl?: string } = {}) {
  return {
    async claimDue(now: Date, limit = 50): Promise<CalendarReminderPayload[]> {
      return db.transaction(async (tx) => {
        const eventAuthor = alias(authUsers, "calendar_event_author");
        const rows = await tx.select({
          reminder: eventReminders,
          event: calendarEvents,
          calendar: calendars,
          recipientName: authUsers.name,
          recipientEmail: authUsers.email,
          authorName: eventAuthor.name,
          preferenceTimezone: userNotificationPreferences.timezone,
          preferenceEnabled: userNotificationPreferences.eventRemindersEnabled,
        })
          .from(eventReminders)
          .innerJoin(calendarEvents, eq(calendarEvents.id, eventReminders.eventId))
          .innerJoin(calendars, eq(calendars.id, calendarEvents.calendarId))
          .innerJoin(calendarMembers, and(
            eq(calendarMembers.calendarId, calendarEvents.calendarId),
            eq(calendarMembers.userId, eventReminders.recipientUserId),
            eq(calendarMembers.status, "active"),
          ))
          .innerJoin(companyMemberships, and(
            eq(companyMemberships.companyId, eventReminders.companyId),
            eq(companyMemberships.principalType, "user"),
            eq(companyMemberships.principalId, eventReminders.recipientUserId),
            eq(companyMemberships.membershipRole, "owner"),
            eq(companyMemberships.status, "active"),
          ))
          .innerJoin(authUsers, eq(authUsers.id, eventReminders.recipientUserId))
          .leftJoin(eventAuthor, eq(eventAuthor.id, calendarEvents.authorUserId))
          .leftJoin(userNotificationPreferences, eq(userNotificationPreferences.userId, eventReminders.recipientUserId))
          .where(and(
            inArray(eventReminders.status, CLAIM_STATUSES),
            lte(eventReminders.nextAttemptAt, now),
            gt(calendarEvents.startsAt, now),
            eq(calendars.status, "active"),
            or(isNull(userNotificationPreferences.eventRemindersEnabled), eq(userNotificationPreferences.eventRemindersEnabled, true))!,
          ))
          .limit(limit);

        const enabledRows = rows.filter((row) => row.preferenceEnabled !== false);
        if (enabledRows.length === 0) return [];
        await tx.update(eventReminders).set({ status: "sending", updatedAt: now })
          .where(inArray(eventReminders.id, enabledRows.map((row) => row.reminder.id)));

        return enabledRows.map((row) => {
          const timezone = row.preferenceTimezone ?? DEFAULT_TIMEZONE;
          return {
            id: row.reminder.id,
            eventId: row.event.id,
            calendarId: row.calendar.id,
            companyId: row.reminder.companyId,
            recipientUserId: row.reminder.recipientUserId,
            recipientEmail: row.recipientEmail,
            recipientName: row.recipientName,
            recipientTimezone: timezone,
            attempts: row.reminder.attempts,
            scheduleVersion: row.reminder.scheduleVersion,
            calendarName: row.calendar.name,
            eventTitle: row.event.title,
            eventNote: row.event.note,
            eventStartsAt: row.event.startsAt,
            eventStartsAtLocal: formatLocalStart(row.event.startsAt, timezone),
            eventTimezone: row.event.timezone,
            authorName: row.authorName,
            eventUrl: eventUrl(deps.publicUrl, row.event.id),
          };
        });
      });
    },

    async markSent(id: string, sentAt: Date) {
      await db.update(eventReminders).set({
        status: "sent",
        sentAt,
        lastError: null,
        updatedAt: sentAt,
      }).where(eq(eventReminders.id, id));
    },

    async markRetry(id: string, update: { attempts: number; nextAttemptAt: Date; lastError: string; failed: boolean }) {
      await db.update(eventReminders).set({
        status: update.failed ? "failed" : "retry",
        attempts: update.attempts,
        nextAttemptAt: update.nextAttemptAt,
        lastError: update.lastError,
        updatedAt: new Date(),
      }).where(eq(eventReminders.id, id));
    },
  };
}
