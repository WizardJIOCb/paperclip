import { describe, expect, it, vi } from "vitest";
import { calendarReminderService } from "./calendar-reminders.js";

describe("calendarReminderService", () => {
  it("continues sending after one recipient fails and does not resend successful deliveries", async () => {
    const sendReminder = vi.fn(async ({ recipientUserId }: { recipientUserId: string }) => {
      if (recipientUserId === "owner-1") throw new Error("temporary smtp error");
    });
    const store = {
      claimDue: vi.fn()
        .mockResolvedValueOnce([
          { id: "r1", recipientUserId: "owner-1", attempts: 0 },
          { id: "r2", recipientUserId: "owner-2", attempts: 0 },
        ])
        .mockResolvedValueOnce([]),
      markSent: vi.fn(),
      markRetry: vi.fn(),
    };
    const service = calendarReminderService(store as never, { sendReminder, now: () => new Date("2026-08-07T14:00:00.000Z") });

    await service.tick();
    await service.tick();

    expect(sendReminder).toHaveBeenCalledTimes(2);
    expect(store.markSent).toHaveBeenCalledWith("r2", expect.any(Date));
    expect(store.markRetry).toHaveBeenCalledWith("r1", expect.objectContaining({ attempts: 1 }));
  });

  it("calculates immediate delivery for future events created inside the three-hour window", () => {
    const now = new Date("2026-08-07T14:00:00.000Z");
    const service = calendarReminderService({} as never, { sendReminder: vi.fn(), now: () => now });
    expect(service.scheduledFor(new Date("2026-08-07T16:00:00.000Z"))).toEqual(now);
    expect(service.scheduledFor(new Date("2026-08-07T13:59:59.000Z"))).toBeNull();
  });
});
