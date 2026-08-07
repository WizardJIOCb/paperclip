export function isCompanyOwner(membership: { membershipRole?: string | null; status?: string | null } | null | undefined) {
  return membership?.membershipRole === "owner" && membership.status === "active";
}

export function canAccessCalendar(input: { companyOwner: boolean; calendarMemberStatus?: string | null }) {
  return input.companyOwner && input.calendarMemberStatus === "active";
}
