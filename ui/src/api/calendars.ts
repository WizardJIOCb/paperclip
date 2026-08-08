import type {
  Calendar,
  CalendarEvent,
  CalendarInvitation,
  CalendarMember,
  CalendarOwnerCandidate,
  CreateCalendar,
  CreateCalendarEvent,
  CreateCalendarInvitation,
  DeleteCalendar,
  TransferCalendarOwnership,
  UpdateCalendar,
  UpdateCalendarEvent,
  UpdateNotificationPreferences,
  UserNotificationPreferences,
} from "@paperclipai/shared";
import { api } from "./client";

export type CalendarView = "month" | "week" | "day";

export const calendarsApi = {
  list: (companyId: string, includeArchived = false) =>
    api.get<Calendar[]>(`/companies/${companyId}/calendars${includeArchived ? "?includeArchived=true" : ""}`),
  get: (calendarId: string) => api.get<Calendar>(`/calendars/${calendarId}`),
  create: (companyId: string, data: CreateCalendar) =>
    api.post<Calendar>(`/companies/${companyId}/calendars`, data),
  update: (calendarId: string, data: UpdateCalendar) =>
    api.patch<Calendar>(`/calendars/${calendarId}`, data),
  archive: (calendarId: string) => api.post<Calendar>(`/calendars/${calendarId}/archive`, {}),
  remove: (calendarId: string, data: DeleteCalendar) =>
    api.delete<void>(`/calendars/${calendarId}`, data),
  transferOwnership: (calendarId: string, data: TransferCalendarOwnership) =>
    api.put<Calendar>(`/calendars/${calendarId}/ownership`, data),
  members: (calendarId: string) => api.get<CalendarMember[]>(`/calendars/${calendarId}/members`),
  inviteCandidates: (calendarId: string) =>
    api.get<CalendarOwnerCandidate[]>(`/calendars/${calendarId}/invite-candidates`),
  createInvitation: (calendarId: string, data: CreateCalendarInvitation) =>
    api.post<CalendarInvitation>(`/calendars/${calendarId}/invitations`, data),
  acceptInvitation: (token: string) =>
    api.post<{ calendarId: string; accepted: true }>(`/calendar-invitations/${encodeURIComponent(token)}/accept`, {}),
  removeMember: (calendarId: string, userId: string) =>
    api.delete<void>(`/calendars/${calendarId}/members/${encodeURIComponent(userId)}`),
  leave: (calendarId: string) => api.post<void>(`/calendars/${calendarId}/leave`, {}),
  listEvents: (
    companyId: string,
    input: { from: string; to: string; calendarIds?: string[] },
  ) => {
    const params = new URLSearchParams({ from: input.from, to: input.to });
    if (input.calendarIds?.length) params.set("calendarIds", input.calendarIds.join(","));
    return api.get<CalendarEvent[]>(`/companies/${companyId}/calendar-events?${params.toString()}`);
  },
  createEvent: (calendarId: string, data: CreateCalendarEvent) =>
    api.post<CalendarEvent>(`/calendars/${calendarId}/events`, data),
  getEvent: (eventId: string) => api.get<CalendarEvent>(`/calendar-events/${eventId}`),
  updateEvent: (eventId: string, data: UpdateCalendarEvent) =>
    api.patch<CalendarEvent>(`/calendar-events/${eventId}`, data),
  deleteEvent: (eventId: string, expectedVersion: number) =>
    api.delete<void>(`/calendar-events/${eventId}`, { expectedVersion }),
  getNotificationPreferences: () =>
    api.get<UserNotificationPreferences>("/calendar-notification-preferences"),
  updateNotificationPreferences: (data: UpdateNotificationPreferences) =>
    api.patch<UserNotificationPreferences>("/calendar-notification-preferences", data),
};
