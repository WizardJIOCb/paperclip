export type CalendarStatus = "active" | "archived";
export type CalendarMemberRole = "creator" | "member";
export type CalendarMemberStatus = "active" | "left" | "removed";
export type CalendarInvitationStatus = "pending" | "accepted" | "revoked" | "expired";
export type EventReminderStatus = "pending" | "retry" | "sending" | "sent" | "cancelled" | "failed";

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
  invitedUserId: string;
  invitedEmail: string;
  status: CalendarInvitationStatus;
  expiresAt: string;
  createdAt: string;
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
  startsAt: string;
  endsAt: string | null;
  timezone: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarOwnerCandidate {
  userId: string;
  name: string | null;
  email: string | null;
}
