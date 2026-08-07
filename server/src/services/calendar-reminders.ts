const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 4;

type Reminder = { id: string; recipientUserId: string; attempts: number; [key: string]: unknown };
type ReminderStore = {
  claimDue(now: Date): Promise<Reminder[]>;
  markSent(id: string, sentAt: Date): Promise<unknown>;
  markRetry(id: string, update: { attempts: number; nextAttemptAt: Date; lastError: string; failed: boolean }): Promise<unknown>;
};

export function calendarReminderService(
  store: ReminderStore,
  deps: { sendReminder: (reminder: Reminder) => Promise<unknown>; now?: () => Date },
) {
  const now = deps.now ?? (() => new Date());
  return {
    scheduledFor(startsAt: Date) {
      const current = now();
      if (startsAt.getTime() <= current.getTime()) return null;
      const target = new Date(startsAt.getTime() - THREE_HOURS_MS);
      return target.getTime() <= current.getTime() ? current : target;
    },
    async tick() {
      const claimed = await store.claimDue(now());
      for (const reminder of claimed) {
        try {
          await deps.sendReminder(reminder);
          await store.markSent(reminder.id, now());
        } catch (error) {
          const attempts = reminder.attempts + 1;
          const lastError = error instanceof Error ? error.message.slice(0, 500) : "Reminder delivery failed";
          await store.markRetry(reminder.id, {
            attempts,
            nextAttemptAt: new Date(now().getTime() + Math.min(60, 2 ** attempts) * 60_000),
            lastError,
            failed: attempts >= MAX_ATTEMPTS,
          });
        }
      }
      return { processed: claimed.length };
    },
  };
}
