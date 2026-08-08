export type CalendarStatus = "active" | "archived";
export type CalendarMemberRole = "creator" | "member";
export type CalendarMemberStatus = "active" | "left" | "removed";
export type CalendarInvitationStatus =
  "pending" | "accepted" | "revoked" | "expired";
export type EventReminderStatus =
  "pending" | "retry" | "sending" | "sent" | "cancelled" | "failed";

export interface Calendar {
  id: string;
  companyId: string;
  creatorUserId: string;
  name: string;
  description: string | null;
  color: string;
  status: CalendarStatus;
  memberRole: CalendarMemberRole;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarMember {
  id: string;
  calendarId: string;
  userId: string;
  role: CalendarMemberRole;
  status: CalendarMemberStatus;
  name: string | null;
  email: string | null;
  joinedAt: string;
}

export interface CalendarInvitation {
  id: string;
  calendarId: string;
  /** Null for email invitations to a user who has not signed up yet. */
  invitedUserId: string | null;
  invitedEmail: string;
  status: CalendarInvitationStatus;
  expiresAt: string;
  createdAt: string;
  /**
   * Plaintext token, returned exactly once at creation time so the caller can
   * build an accept link. Only the SHA-256 hash is persisted.
   */
  inviteToken?: string;
}

export interface CalendarEvent {
  id: string;
  companyId: string;
  calendarId: string;
  authorUserId: string;
  authorName: string | null;
  title: string;
  note: string | null;
  /** ISO-8601 UTC instant. Always stored and transported in UTC. */
  startsAt: string;
  endsAt: string | null;
  /** IANA zone the event was authored in, used for display. */
  timezone: string;
  /** Bumped on every edit; required by clients for optimistic concurrency. */
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarOwnerCandidate {
  userId: string;
  name: string | null;
  email: string | null;
}

export interface UserNotificationPreferences {
  timezone: string;
  eventRemindersEnabled: boolean;
}

/** Body returned with HTTP 409 when an edit loses an optimistic-concurrency race. */
export interface CalendarEventConflict {
  error: string;
  code: "event_version_conflict";
  current: CalendarEvent;
}
