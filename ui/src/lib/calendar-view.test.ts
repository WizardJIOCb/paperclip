import { describe, expect, it } from "vitest";
import {
  dayKey,
  enumerateNotesCalendarDays,
  notesCalendarRange,
  shiftNotesCalendarAnchor,
} from "./calendar-view";

describe("notes calendar view helpers", () => {
  it("builds a Monday-start week range", () => {
    const range = notesCalendarRange("week", new Date("2026-08-08T12:00:00.000Z"));
    expect(dayKey(range.from)).toBe("2026-08-03");
    expect(dayKey(range.to)).toBe("2026-08-10");
  });

  it("enumerates month days without leaking the next month", () => {
    const days = enumerateNotesCalendarDays("month", new Date("2026-02-14T12:00:00.000Z"));
    expect(days).toHaveLength(28);
    expect(dayKey(days[0]!)).toBe("2026-02-01");
    expect(dayKey(days[27]!)).toBe("2026-02-28");
  });

  it("shifts anchors by view granularity", () => {
    expect(dayKey(shiftNotesCalendarAnchor("day", new Date("2026-08-08"), 1))).toBe("2026-08-09");
    expect(dayKey(shiftNotesCalendarAnchor("week", new Date("2026-08-08"), -1))).toBe("2026-08-01");
    expect(dayKey(shiftNotesCalendarAnchor("month", new Date("2026-08-08"), 1))).toBe("2026-09-01");
  });
});
