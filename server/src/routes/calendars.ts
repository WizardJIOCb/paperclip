import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import {
  createCalendarEventSchema,
  createCalendarInvitationSchema,
  createCalendarSchema,
  deleteCalendarSchema,
  deleteCalendarEventSchema,
  listCalendarEventsQuerySchema,
  transferCalendarOwnershipSchema,
  updateCalendarEventSchema,
  updateCalendarSchema,
  updateNotificationPreferencesSchema,
} from "@paperclipai/shared";
import { forbidden, unauthorized } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { calendarService } from "../services/calendars.js";
import { logActivity } from "../services/activity-log.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";

export function calendarRoutes(db: Db) {
  const router = Router();
  const svc = calendarService(db);

  function requireOwner(req: Request, companyId: string) {
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    if (req.actor.source === "local_implicit") return req.actor.userId ?? "local-board";
    const membership = req.actor.memberships?.find((item) => item.companyId === companyId && item.status === "active");
    if (membership?.membershipRole !== "owner") throw forbidden("Company owner access is required for Notes");
    if (!req.actor.userId) throw unauthorized();
    return req.actor.userId;
  }

  async function audit(req: Request, companyId: string, action: string, entityType: string, entityId: string) {
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action,
      entityType,
      entityId,
      details: {},
    });
  }

  router.get("/companies/:companyId/calendars", async (req, res) => {
    const companyId = req.params.companyId as string;
    const userId = requireOwner(req, companyId);
    res.json(await svc.list(companyId, userId, req.query.includeArchived === "true"));
  });

  router.post("/companies/:companyId/calendars", validate(createCalendarSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    const userId = requireOwner(req, companyId);
    const calendar = await svc.create(companyId, userId, req.body);
    await audit(req, companyId, "calendar.created", "calendar", calendar.id);
    res.status(201).json(calendar);
  });

  router.get("/calendars/:calendarId", async (req, res) => {
    assertBoard(req);
    const calendar = await svc.get(req.params.calendarId as string, req.actor.userId ?? "local-board");
    requireOwner(req, calendar.companyId);
    res.json(calendar);
  });

  router.patch("/calendars/:calendarId", validate(updateCalendarSchema), async (req, res) => {
    assertBoard(req);
    const calendar = await svc.get(req.params.calendarId as string, req.actor.userId ?? "local-board");
    const userId = requireOwner(req, calendar.companyId);
    const updated = await svc.update(calendar.id, userId, req.body);
    await audit(req, calendar.companyId, "calendar.updated", "calendar", calendar.id);
    res.json(updated);
  });

  router.post("/calendars/:calendarId/archive", async (req, res) => {
    assertBoard(req);
    const calendar = await svc.get(req.params.calendarId as string, req.actor.userId ?? "local-board");
    const userId = requireOwner(req, calendar.companyId);
    const archived = await svc.archive(calendar.id, userId);
    await audit(req, calendar.companyId, "calendar.archived", "calendar", calendar.id);
    res.json(archived);
  });

  router.delete("/calendars/:calendarId", validate(deleteCalendarSchema), async (req, res) => {
    assertBoard(req);
    const calendar = await svc.get(req.params.calendarId as string, req.actor.userId ?? "local-board");
    const userId = requireOwner(req, calendar.companyId);
    await svc.delete(calendar.id, userId);
    await audit(req, calendar.companyId, "calendar.deleted", "calendar", calendar.id);
    res.status(204).end();
  });

  router.put("/calendars/:calendarId/ownership", validate(transferCalendarOwnershipSchema), async (req, res) => {
    assertBoard(req);
    const calendar = await svc.get(req.params.calendarId as string, req.actor.userId ?? "local-board");
    const userId = requireOwner(req, calendar.companyId);
    const updated = await svc.transferOwnership(calendar.id, userId, req.body);
    await audit(req, calendar.companyId, "calendar.ownership_transferred", "calendar", calendar.id);
    res.json(updated);
  });

  router.get("/calendars/:calendarId/members", async (req, res) => {
    assertBoard(req);
    const calendar = await svc.get(req.params.calendarId as string, req.actor.userId ?? "local-board");
    const userId = requireOwner(req, calendar.companyId);
    res.json(await svc.listMembers(calendar.id, userId));
  });

  router.get("/calendars/:calendarId/invite-candidates", async (req, res) => {
    assertBoard(req);
    const calendar = await svc.get(req.params.calendarId as string, req.actor.userId ?? "local-board");
    const userId = requireOwner(req, calendar.companyId);
    res.json(await svc.inviteCandidates(calendar.id, userId));
  });

  router.post("/calendars/:calendarId/invitations", validate(createCalendarInvitationSchema), async (req, res) => {
    assertBoard(req);
    const calendar = await svc.get(req.params.calendarId as string, req.actor.userId ?? "local-board");
    const userId = requireOwner(req, calendar.companyId);
    const invitation = await svc.createInvitation(calendar.id, userId, req.body);
    await audit(req, calendar.companyId, "calendar.invitation_created", "calendar", calendar.id);
    res.status(201).json(invitation);
  });

  router.post("/calendar-invitations/:token/accept", async (req, res) => {
    assertBoard(req);
    if (!req.actor.userId) throw unauthorized();
    const result = await svc.acceptInvitation(req.params.token as string, req.actor.userId, req.actor.userEmail);
    res.json(result);
  });

  router.delete("/calendars/:calendarId/members/:userId", async (req, res) => {
    assertBoard(req);
    const calendar = await svc.get(req.params.calendarId as string, req.actor.userId ?? "local-board");
    const userId = requireOwner(req, calendar.companyId);
    await svc.removeMember(calendar.id, userId, req.params.userId as string);
    await audit(req, calendar.companyId, "calendar.member_removed", "calendar", calendar.id);
    res.status(204).end();
  });

  router.post("/calendars/:calendarId/leave", async (req, res) => {
    assertBoard(req);
    const calendar = await svc.get(req.params.calendarId as string, req.actor.userId ?? "local-board");
    const userId = requireOwner(req, calendar.companyId);
    await svc.leave(calendar.id, userId);
    await audit(req, calendar.companyId, "calendar.member_left", "calendar", calendar.id);
    res.status(204).end();
  });

  router.get("/companies/:companyId/calendar-events", async (req, res) => {
    const companyId = req.params.companyId as string;
    const userId = requireOwner(req, companyId);
    const query = listCalendarEventsQuerySchema.parse(req.query);
    const calendarIds = query.calendarIds?.split(",").map((id) => id.trim()).filter(Boolean);
    res.json(await svc.listEvents(companyId, userId, new Date(query.from), new Date(query.to), calendarIds));
  });

  router.post("/calendars/:calendarId/events", validate(createCalendarEventSchema), async (req, res) => {
    assertBoard(req);
    const calendar = await svc.get(req.params.calendarId as string, req.actor.userId ?? "local-board");
    const userId = requireOwner(req, calendar.companyId);
    const event = await svc.createEvent(calendar.id, userId, req.body);
    await audit(req, calendar.companyId, "calendar_event.created", "calendar_event", event.id);
    res.status(201).json(event);
  });

  router.get("/calendar-events/:eventId", async (req, res) => {
    assertBoard(req);
    const event = await svc.getEvent(req.params.eventId as string, req.actor.userId ?? "local-board");
    requireOwner(req, event.companyId);
    res.json(event);
  });

  router.patch("/calendar-events/:eventId", validate(updateCalendarEventSchema), async (req, res) => {
    assertBoard(req);
    const event = await svc.getEvent(req.params.eventId as string, req.actor.userId ?? "local-board");
    const userId = requireOwner(req, event.companyId);
    const updated = await svc.updateEvent(event.id, userId, req.body);
    await audit(req, event.companyId, "calendar_event.updated", "calendar_event", event.id);
    res.json(updated);
  });

  router.delete("/calendar-events/:eventId", validate(deleteCalendarEventSchema), async (req, res) => {
    assertBoard(req);
    const event = await svc.getEvent(req.params.eventId as string, req.actor.userId ?? "local-board");
    const userId = requireOwner(req, event.companyId);
    await svc.deleteEvent(event.id, userId, req.body.expectedVersion);
    await audit(req, event.companyId, "calendar_event.deleted", "calendar_event", event.id);
    res.status(204).end();
  });

  router.get("/calendar-notification-preferences", async (req, res) => {
    assertBoard(req);
    if (!req.actor.userId) throw unauthorized();
    res.json(await svc.getNotificationPreferences(req.actor.userId));
  });

  router.patch("/calendar-notification-preferences", validate(updateNotificationPreferencesSchema), async (req, res) => {
    assertBoard(req);
    if (!req.actor.userId) throw unauthorized();
    res.json(await svc.updateNotificationPreferences(req.actor.userId, req.body));
  });

  return router;
}
