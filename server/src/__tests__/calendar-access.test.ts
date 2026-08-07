import { describe, expect, it } from "vitest";
import { canAccessCalendar, isCompanyOwner } from "../services/calendar-access.js";

describe("calendar owner and membership access", () => {
  it("requires an active company owner role", () => {
    expect(isCompanyOwner({ membershipRole: "owner", status: "active" })).toBe(true);
    expect(isCompanyOwner({ membershipRole: "admin", status: "active" })).toBe(false);
    expect(isCompanyOwner({ membershipRole: "owner", status: "suspended" })).toBe(false);
  });

  it("requires membership in the specific calendar", () => {
    expect(canAccessCalendar({ companyOwner: true, calendarMemberStatus: "active" })).toBe(true);
    expect(canAccessCalendar({ companyOwner: true, calendarMemberStatus: "removed" })).toBe(false);
    expect(canAccessCalendar({ companyOwner: false, calendarMemberStatus: "active" })).toBe(false);
  });
});
