import { describe, expect, it } from "vitest";
import {
  createCalendarEventSchema,
  createCalendarInvitationSchema,
  createCalendarSchema,
  listCalendarEventsQuerySchema,
  updateCalendarEventSchema,
} from "./calendar.js";

describe("calendar validators", () => {
  it("accepts a calendar with a bounded name and CSS color", () => {
    expect(createCalendarSchema.parse({ name: "Launches", description: "Shared dates", color: "#2563eb" })).toEqual({
      name: "Launches",
      description: "Shared dates",
      color: "#2563eb",
    });
  });

  it("rejects invalid colors and empty names", () => {
    expect(createCalendarSchema.safeParse({ name: "", color: "blue" }).success).toBe(false);
  });

  it("requires a valid event range, IANA timezone, and expected version for updates", () => {
    const event = {
      title: "Review",
      note: "Read the draft",
      startsAt: "2026-08-07T14:00:00.000Z",
      endsAt: "2026-08-07T15:00:00.000Z",
      timezone: "Europe/Moscow",
    };
    expect(createCalendarEventSchema.safeParse(event).success).toBe(true);
    expect(createCalendarEventSchema.safeParse({ ...event, endsAt: "2026-08-07T13:00:00.000Z" }).success).toBe(false);
    expect(createCalendarEventSchema.safeParse({ ...event, timezone: "Mars/Olympus" }).success).toBe(false);
    expect(updateCalendarEventSchema.safeParse({ title: "Changed" }).success).toBe(false);
    expect(updateCalendarEventSchema.safeParse({ title: "Changed", expectedVersion: 1 }).success).toBe(true);
  });

  it("bounds event range queries", () => {
    const base = { from: "2026-08-01T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z" };
    expect(listCalendarEventsQuerySchema.safeParse(base).success).toBe(true);
    expect(listCalendarEventsQuerySchema.safeParse({ ...base, to: "2028-09-01T00:00:00.000Z" }).success).toBe(false);
  });

  it("only accepts an existing target user id for invitations", () => {
    expect(createCalendarInvitationSchema.safeParse({ invitedUserId: "owner-2" }).success).toBe(true);
    expect(createCalendarInvitationSchema.safeParse({ email: "external@example.com" }).success).toBe(false);
  });
});
