import { z } from "zod";

const MAX_RANGE_MS = 370 * 24 * 60 * 60 * 1000;
const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a six-digit hex value");
const isoDateTimeSchema = z.string().datetime({ offset: true });

function isIanaTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export const calendarTimezoneSchema = z
  .string()
  .min(1)
  .max(100)
  .refine(isIanaTimezone, "Invalid IANA timezone");
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

// Strictly greater, mirroring the DB CHECK `ends_at > starts_at`. Keeping the
// two in sync stops a zero-length event from passing validation and then
// failing on insert with an opaque constraint violation.
function validEventRange(value: { startsAt?: string; endsAt?: string | null }) {
  return (
    !value.endsAt ||
    !value.startsAt ||
    new Date(value.endsAt).getTime() > new Date(value.startsAt).getTime()
  );
}

export const createCalendarEventSchema = eventFields.refine(validEventRange, {
  message: "Event end must be after its start",
  path: ["endsAt"],
});
export const updateCalendarEventSchema = eventFields
  .partial()
  .extend({
    expectedVersion: z.number().int().positive(),
  })
  .refine(validEventRange, {
    message: "Event end must be after its start",
    path: ["endsAt"],
  });
export const deleteCalendarEventSchema = z.object({
  expectedVersion: z.number().int().positive(),
});

// Inviting by userId is the preferred path (pick an existing owner in the same
// company). Email invitations are accepted too, but never auto-join anyone:
// they create a single-use, hashed, expiring token that must be accepted while
// signed in with a matching email.
export const createCalendarInvitationSchema = z
  .object({
    invitedUserId: z.string().trim().min(1).max(200).optional(),
    invitedEmail: z.string().trim().toLowerCase().email().max(320).optional(),
  })
  .strict()
  .refine(
    (value) => Boolean(value.invitedUserId) !== Boolean(value.invitedEmail),
    { message: "Provide exactly one of invitedUserId or invitedEmail" },
  );

/**
 * Transferring ownership is a separate, explicitly confirmed action so the
 * creator can never be removed from a calendar by accident.
 */
export const transferCalendarOwnershipSchema = z
  .object({
    newCreatorUserId: z.string().trim().min(1).max(200),
    confirm: z.literal(true),
  })
  .strict();

/** Deleting a calendar destroys its events; require an explicit confirmation. */
export const deleteCalendarSchema = z
  .object({ confirm: z.literal(true) })
  .strict();

export const updateNotificationPreferencesSchema = z
  .object({
    timezone: calendarTimezoneSchema.optional(),
    eventRemindersEnabled: z.boolean().optional(),
  })
  .strict();
export const listCalendarEventsQuerySchema = z
  .object({
    from: isoDateTimeSchema,
    to: isoDateTimeSchema,
    calendarIds: z.string().optional(),
  })
  .refine(
    (value) => {
      const from = new Date(value.from).getTime();
      const to = new Date(value.to).getTime();
      return to > from && to - from <= MAX_RANGE_MS;
    },
    { message: "Event range must be positive and no longer than 370 days" },
  );

export type CreateCalendar = z.infer<typeof createCalendarSchema>;
export type UpdateCalendar = z.infer<typeof updateCalendarSchema>;
export type CreateCalendarEvent = z.infer<typeof createCalendarEventSchema>;
export type UpdateCalendarEvent = z.infer<typeof updateCalendarEventSchema>;
export type CreateCalendarInvitation = z.infer<
  typeof createCalendarInvitationSchema
>;
export type ListCalendarEventsQuery = z.infer<
  typeof listCalendarEventsQuerySchema
>;
export type TransferCalendarOwnership = z.infer<
  typeof transferCalendarOwnershipSchema
>;
export type DeleteCalendar = z.infer<typeof deleteCalendarSchema>;
export type UpdateNotificationPreferences = z.infer<
  typeof updateNotificationPreferencesSchema
>;
