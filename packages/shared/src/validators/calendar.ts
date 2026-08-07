import { z } from "zod";

const MAX_RANGE_MS = 370 * 24 * 60 * 60 * 1000;
const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must be a six-digit hex value");
const isoDateTimeSchema = z.string().datetime({ offset: true });

function isIanaTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export const calendarTimezoneSchema = z.string().min(1).max(100).refine(isIanaTimezone, "Invalid IANA timezone");
export const createCalendarSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional().nullable(),
  color: hexColorSchema,
});
export const updateCalendarSchema = createCalendarSchema.partial().extend({
  status: z.enum(["active", "archived"]).optional(),
});

const eventFields = z.object({
  title: z.string().trim().min(1).max(240),
  note: z.string().max(100_000).optional().nullable(),
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema.optional().nullable(),
  timezone: calendarTimezoneSchema,
});

function validEventRange(value: { startsAt?: string; endsAt?: string | null }) {
  return !value.endsAt || !value.startsAt || new Date(value.endsAt).getTime() >= new Date(value.startsAt).getTime();
}

export const createCalendarEventSchema = eventFields.refine(validEventRange, {
  message: "Event end must not be before its start",
  path: ["endsAt"],
});
export const updateCalendarEventSchema = eventFields.partial().extend({
  expectedVersion: z.number().int().positive(),
}).refine(validEventRange, {
  message: "Event end must not be before its start",
  path: ["endsAt"],
});
export const deleteCalendarEventSchema = z.object({ expectedVersion: z.number().int().positive() });
export const createCalendarInvitationSchema = z.object({ invitedUserId: z.string().trim().min(1).max(200) }).strict();
export const listCalendarEventsQuerySchema = z.object({
  from: isoDateTimeSchema,
  to: isoDateTimeSchema,
  calendarIds: z.string().optional(),
}).refine((value) => {
  const from = new Date(value.from).getTime();
  const to = new Date(value.to).getTime();
  return to > from && to - from <= MAX_RANGE_MS;
}, { message: "Event range must be positive and no longer than 370 days" });

export type CreateCalendar = z.infer<typeof createCalendarSchema>;
export type UpdateCalendar = z.infer<typeof updateCalendarSchema>;
export type CreateCalendarEvent = z.infer<typeof createCalendarEventSchema>;
export type UpdateCalendarEvent = z.infer<typeof updateCalendarEventSchema>;
export type CreateCalendarInvitation = z.infer<typeof createCalendarInvitationSchema>;
export type ListCalendarEventsQuery = z.infer<typeof listCalendarEventsQuerySchema>;
