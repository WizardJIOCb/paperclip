import { createHash, randomBytes } from "node:crypto";
import { and, asc, eq, gt, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  authUsers,
  calendarEvents,
  calendarInvitations,
  calendarMembers,
  calendars,
  companyMemberships,
  eventReminders,
} from "@paperclipai/db";
import type { CreateCalendar, CreateCalendarEvent, UpdateCalendar, UpdateCalendarEvent } from "@paperclipai/shared";
import { conflict, forbidden, notFound } from "../errors.js";

const REMINDER_OFFSET_MS = 3 * 60 * 60 * 1000;
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ACTIVE_DELIVERY_STATUSES = ["pending", "retry", "sending"] as const;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function invitationStatus(row: typeof calendarInvitations.$inferSelect) {
  if (row.revokedAt) return "revoked" as const;
  if (row.acceptedAt) return "accepted" as const;
  if (row.expiresAt.getTime() <= Date.now()) return "expired" as const;
  return "pending" as const;
}

export function calendarService(db: Db, deps: { now?: () => Date } = {}) {
  const now = deps.now ?? (() => new Date());

  async function membership(calendarId: string, userId: string) {
    return db.select({
      calendar: calendars,
      member: calendarMembers,
    }).from(calendars).innerJoin(calendarMembers, and(
      eq(calendarMembers.calendarId, calendars.id),
      eq(calendarMembers.userId, userId),
      eq(calendarMembers.status, "active"),
    )).where(eq(calendars.id, calendarId)).then((rows) => rows[0] ?? null);
  }

  async function requireMembership(calendarId: string, userId: string) {
    const resolved = await membership(calendarId, userId);
    if (!resolved) throw notFound("Calendar not found");
    return resolved;
  }

  async function requireCreator(calendarId: string, userId: string) {
    const resolved = await requireMembership(calendarId, userId);
    if (resolved.calendar.creatorUserId !== userId || resolved.member.role !== "creator") {
      throw forbidden("Only the calendar creator can manage calendar settings or participants");
    }
    return resolved;
  }

  async function activeOwnerUser(userId: string, companyId: string) {
    return db.select({ id: authUsers.id, name: authUsers.name, email: authUsers.email })
      .from(companyMemberships)
      .innerJoin(authUsers, eq(authUsers.id, companyMemberships.principalId))
      .where(and(
        eq(companyMemberships.companyId, companyId),
        eq(companyMemberships.principalType, "user"),
        eq(companyMemberships.principalId, userId),
        eq(companyMemberships.membershipRole, "owner"),
        eq(companyMemberships.status, "active"),
      )).then((rows) => rows[0] ?? null);
  }

  function reminderTime(startsAt: Date) {
    const current = now();
    if (startsAt.getTime() <= current.getTime()) return null;
    const scheduled = new Date(startsAt.getTime() - REMINDER_OFFSET_MS);
    return scheduled.getTime() <= current.getTime() ? current : scheduled;
  }

  async function scheduleEventReminders(event: typeof calendarEvents.$inferSelect, cancelPrevious: boolean) {
    if (cancelPrevious) {
      await db.update(eventReminders).set({ status: "cancelled", updatedAt: now() }).where(and(
        eq(eventReminders.eventId, event.id),
        inArray(eventReminders.status, ACTIVE_DELIVERY_STATUSES),
        ne(eventReminders.scheduleVersion, event.scheduleVersion),
      ));
    }
    const scheduledFor = reminderTime(event.startsAt);
    if (!scheduledFor) return;
    const recipients = await db.select({ userId: calendarMembers.userId })
      .from(calendarMembers)
      .innerJoin(companyMemberships, and(
        eq(companyMemberships.companyId, calendarMembers.companyId),
        eq(companyMemberships.principalType, "user"),
        eq(companyMemberships.principalId, calendarMembers.userId),
        eq(companyMemberships.membershipRole, "owner"),
        eq(companyMemberships.status, "active"),
      ))
      .where(and(eq(calendarMembers.calendarId, event.calendarId), eq(calendarMembers.status, "active")));
    if (recipients.length === 0) return;
    await db.insert(eventReminders).values(recipients.map(({ userId }) => ({
      companyId: event.companyId,
      eventId: event.id,
      recipientUserId: userId,
      scheduleVersion: event.scheduleVersion,
      scheduledFor,
      nextAttemptAt: scheduledFor,
    }))).onConflictDoNothing();
  }

  return {
    async list(companyId: string, userId: string, includeArchived = false) {
      const conditions = [
        eq(calendars.companyId, companyId),
        eq(calendarMembers.userId, userId),
        eq(calendarMembers.status, "active"),
      ];
      if (!includeArchived) conditions.push(eq(calendars.status, "active"));
      return db.select({ calendar: calendars, memberRole: calendarMembers.role })
        .from(calendars)
        .innerJoin(calendarMembers, eq(calendarMembers.calendarId, calendars.id))
        .where(and(...conditions))
        .orderBy(asc(calendars.name))
        .then((rows) => rows.map(({ calendar, memberRole }) => ({ ...calendar, memberRole })));
    },

    async get(calendarId: string, userId: string) {
      const resolved = await requireMembership(calendarId, userId);
      return { ...resolved.calendar, memberRole: resolved.member.role };
    },

    async create(companyId: string, userId: string, input: CreateCalendar) {
      return db.transaction(async (tx) => {
        const calendar = await tx.insert(calendars).values({
          companyId,
          creatorUserId: userId,
          name: input.name,
          description: input.description ?? null,
          color: input.color,
        }).returning().then((rows) => rows[0]!);
        await tx.insert(calendarMembers).values({ companyId, calendarId: calendar.id, userId, role: "creator" });
        return { ...calendar, memberRole: "creator" as const };
      });
    },

    async update(calendarId: string, userId: string, input: UpdateCalendar) {
      await requireCreator(calendarId, userId);
      return db.update(calendars).set({ ...input, updatedAt: now() }).where(eq(calendars.id, calendarId)).returning()
        .then((rows) => ({ ...rows[0]!, memberRole: "creator" as const }));
    },

    async delete(calendarId: string, userId: string) {
      await requireCreator(calendarId, userId);
      await db.delete(calendars).where(eq(calendars.id, calendarId));
    },

    async listMembers(calendarId: string, userId: string) {
      await requireMembership(calendarId, userId);
      return db.select({
        id: calendarMembers.id,
        calendarId: calendarMembers.calendarId,
        userId: calendarMembers.userId,
        role: calendarMembers.role,
        status: calendarMembers.status,
        joinedAt: calendarMembers.joinedAt,
        name: authUsers.name,
        email: authUsers.email,
      }).from(calendarMembers).leftJoin(authUsers, eq(authUsers.id, calendarMembers.userId))
        .where(and(eq(calendarMembers.calendarId, calendarId), eq(calendarMembers.status, "active")))
        .orderBy(asc(calendarMembers.joinedAt));
    },

    async inviteCandidates(calendarId: string, userId: string) {
      const { calendar } = await requireCreator(calendarId, userId);
      const activeMemberIds = db.select({ userId: calendarMembers.userId }).from(calendarMembers)
        .where(and(eq(calendarMembers.calendarId, calendarId), eq(calendarMembers.status, "active")));
      return db.select({ userId: authUsers.id, name: authUsers.name, email: authUsers.email })
        .from(companyMemberships)
        .innerJoin(authUsers, eq(authUsers.id, companyMemberships.principalId))
        .where(and(
          eq(companyMemberships.companyId, calendar.companyId),
          eq(companyMemberships.principalType, "user"),
          eq(companyMemberships.membershipRole, "owner"),
          eq(companyMemberships.status, "active"),
          sql`${companyMemberships.principalId} not in (${activeMemberIds})`,
        )).orderBy(asc(authUsers.name));
    },

    async createInvitation(calendarId: string, userId: string, invitedUserId: string) {
      const { calendar } = await requireCreator(calendarId, userId);
      const target = await activeOwnerUser(invitedUserId, calendar.companyId);
      if (!target) throw forbidden("Only active owners from the same company can be invited");
      const existingMember = await db.select({ status: calendarMembers.status }).from(calendarMembers)
        .where(and(eq(calendarMembers.calendarId, calendarId), eq(calendarMembers.userId, invitedUserId)))
        .then((rows) => rows[0] ?? null);
      if (existingMember?.status === "active") throw conflict("User is already a calendar participant");
      const inviteToken = randomBytes(32).toString("base64url");
      const values = {
        companyId: calendar.companyId,
        calendarId,
        invitedUserId,
        invitedEmail: target.email.trim().toLowerCase(),
        invitedByUserId: userId,
        tokenHash: hashToken(inviteToken),
        expiresAt: new Date(now().getTime() + INVITATION_TTL_MS),
        acceptedAt: null,
        revokedAt: null,
        updatedAt: now(),
      };
      const invitation = await db.insert(calendarInvitations).values(values).onConflictDoUpdate({
        target: [calendarInvitations.calendarId, calendarInvitations.invitedUserId],
        set: values,
      }).returning().then((rows) => rows[0]!);
      return { ...invitation, status: invitationStatus(invitation), inviteToken };
    },

    async acceptInvitation(token: string, userId: string, userEmail: string | null | undefined) {
      const tokenHash = hashToken(token);
      return db.transaction(async (tx) => {
        const invitation = await tx.select().from(calendarInvitations).where(eq(calendarInvitations.tokenHash, tokenHash))
          .then((rows) => rows[0] ?? null);
        if (!invitation) throw notFound("Calendar invitation not found");
        if (invitation.acceptedAt) throw conflict("Calendar invitation has already been accepted");
        if (invitation.revokedAt || invitation.expiresAt.getTime() <= now().getTime()) throw forbidden("Calendar invitation is no longer active");
        if (invitation.invitedUserId !== userId || invitation.invitedEmail !== userEmail?.trim().toLowerCase()) {
          throw forbidden("Calendar invitation belongs to another user");
        }
        const owner = await activeOwnerUser(userId, invitation.companyId);
        if (!owner) throw forbidden("Only an active owner from this company can accept the invitation");
        const accepted = await tx.update(calendarInvitations).set({ acceptedAt: now(), updatedAt: now() }).where(and(
          eq(calendarInvitations.id, invitation.id),
          isNull(calendarInvitations.acceptedAt),
          isNull(calendarInvitations.revokedAt),
          gt(calendarInvitations.expiresAt, now()),
        )).returning().then((rows) => rows[0] ?? null);
        if (!accepted) throw conflict("Calendar invitation has already been consumed");
        await tx.insert(calendarMembers).values({
          companyId: invitation.companyId,
          calendarId: invitation.calendarId,
          userId,
          role: "member",
          status: "active",
        }).onConflictDoUpdate({
          target: [calendarMembers.calendarId, calendarMembers.userId],
          set: { role: "member", status: "active", joinedAt: now(), updatedAt: now() },
        });
        return { calendarId: invitation.calendarId, accepted: true };
      }).then(async (result) => {
        const futureEvents = await db.select().from(calendarEvents).where(and(
          eq(calendarEvents.calendarId, result.calendarId),
          gt(calendarEvents.startsAt, now()),
        ));
        for (const event of futureEvents) await scheduleEventReminders(event, false);
        return result;
      });
    },

    async removeMember(calendarId: string, actorUserId: string, targetUserId: string) {
      const { calendar } = await requireCreator(calendarId, actorUserId);
      if (calendar.creatorUserId === targetUserId) throw conflict("The calendar creator cannot be removed");
      await db.update(calendarMembers).set({ status: "removed", updatedAt: now() }).where(and(
        eq(calendarMembers.calendarId, calendarId),
        eq(calendarMembers.userId, targetUserId),
      ));
      const eventIds = db.select({ id: calendarEvents.id }).from(calendarEvents).where(eq(calendarEvents.calendarId, calendarId));
      await db.update(eventReminders).set({ status: "cancelled", updatedAt: now() }).where(and(
        inArray(eventReminders.eventId, eventIds),
        eq(eventReminders.recipientUserId, targetUserId),
        inArray(eventReminders.status, ACTIVE_DELIVERY_STATUSES),
      ));
    },

    async leave(calendarId: string, userId: string) {
      const { calendar } = await requireMembership(calendarId, userId);
      if (calendar.creatorUserId === userId) throw conflict("The calendar creator cannot leave without transferring ownership");
      await db.update(calendarMembers).set({ status: "left", updatedAt: now() }).where(and(
        eq(calendarMembers.calendarId, calendarId),
        eq(calendarMembers.userId, userId),
      ));
      await this.removePendingReminders(calendarId, userId);
    },

    async removePendingReminders(calendarId: string, userId: string) {
      const eventIds = db.select({ id: calendarEvents.id }).from(calendarEvents).where(eq(calendarEvents.calendarId, calendarId));
      await db.update(eventReminders).set({ status: "cancelled", updatedAt: now() }).where(and(
        inArray(eventReminders.eventId, eventIds),
        eq(eventReminders.recipientUserId, userId),
        inArray(eventReminders.status, ACTIVE_DELIVERY_STATUSES),
      ));
    },

    async listEvents(companyId: string, userId: string, from: Date, to: Date, calendarIds?: string[]) {
      const conditions = [
        eq(calendarEvents.companyId, companyId),
        eq(calendarMembers.userId, userId),
        eq(calendarMembers.status, "active"),
        lt(calendarEvents.startsAt, to),
        or(isNull(calendarEvents.endsAt), gte(calendarEvents.endsAt, from))!,
      ];
      if (calendarIds?.length) conditions.push(inArray(calendarEvents.calendarId, calendarIds));
      return db.select({ event: calendarEvents, authorName: authUsers.name })
        .from(calendarEvents)
        .innerJoin(calendarMembers, eq(calendarMembers.calendarId, calendarEvents.calendarId))
        .leftJoin(authUsers, eq(authUsers.id, calendarEvents.authorUserId))
        .where(and(...conditions)).orderBy(asc(calendarEvents.startsAt))
        .then((rows) => rows.map(({ event, authorName }) => ({ ...event, authorName })));
    },

    async createEvent(calendarId: string, userId: string, input: CreateCalendarEvent) {
      const { calendar } = await requireMembership(calendarId, userId);
      const event = await db.insert(calendarEvents).values({
        companyId: calendar.companyId,
        calendarId,
        authorUserId: userId,
        title: input.title,
        note: input.note ?? null,
        startsAt: new Date(input.startsAt),
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        timezone: input.timezone,
      }).returning().then((rows) => rows[0]!);
      await scheduleEventReminders(event, false);
      return { ...event, authorName: null };
    },

    async getEvent(eventId: string, userId: string) {
      const event = await db.select({ event: calendarEvents, authorName: authUsers.name })
        .from(calendarEvents).leftJoin(authUsers, eq(authUsers.id, calendarEvents.authorUserId))
        .where(eq(calendarEvents.id, eventId)).then((rows) => rows[0] ?? null);
      if (!event || !(await membership(event.event.calendarId, userId))) throw notFound("Calendar event not found");
      return { ...event.event, authorName: event.authorName };
    },

    async updateEvent(eventId: string, userId: string, input: UpdateCalendarEvent) {
      const current = await this.getEvent(eventId, userId);
      const scheduleChanged = input.startsAt !== undefined && new Date(input.startsAt).getTime() !== current.startsAt.getTime();
      const startsAt = input.startsAt ? new Date(input.startsAt) : current.startsAt;
      const endsAt = input.endsAt === undefined ? current.endsAt : input.endsAt ? new Date(input.endsAt) : null;
      if (endsAt && endsAt.getTime() < startsAt.getTime()) throw conflict("Event end must not be before its start");
      const rows = await db.update(calendarEvents).set({
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.note === undefined ? {} : { note: input.note }),
        ...(input.startsAt === undefined ? {} : { startsAt }),
        ...(input.endsAt === undefined ? {} : { endsAt }),
        ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
        version: sql`${calendarEvents.version} + 1`,
        ...(scheduleChanged ? { scheduleVersion: sql`${calendarEvents.scheduleVersion} + 1` } : {}),
        updatedAt: now(),
      }).where(and(eq(calendarEvents.id, eventId), eq(calendarEvents.version, input.expectedVersion))).returning();
      if (!rows[0]) throw conflict("This event was changed by another participant. Refresh and try again.", { current });
      await scheduleEventReminders(rows[0], scheduleChanged);
      return { ...rows[0], authorName: current.authorName };
    },

    async deleteEvent(eventId: string, userId: string, expectedVersion: number) {
      await this.getEvent(eventId, userId);
      const deleted = await db.delete(calendarEvents).where(and(
        eq(calendarEvents.id, eventId),
        eq(calendarEvents.version, expectedVersion),
      )).returning({ id: calendarEvents.id });
      if (!deleted[0]) throw conflict("This event was changed by another participant. Refresh and try again.");
    },
  };
}
