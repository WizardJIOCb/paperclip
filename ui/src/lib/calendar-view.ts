export type NotesCalendarView = "month" | "week" | "day";

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function notesCalendarRange(view: NotesCalendarView, anchor: Date) {
  if (view === "day") {
    const from = startOfDay(anchor);
    return { from, to: addDays(from, 1) };
  }

  if (view === "week") {
    const day = anchor.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const from = addDays(startOfDay(anchor), mondayOffset);
    return { from, to: addDays(from, 7) };
  }

  const from = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  return { from, to: new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1) };
}

export function shiftNotesCalendarAnchor(view: NotesCalendarView, anchor: Date, direction: -1 | 1) {
  if (view === "day") return addDays(anchor, direction);
  if (view === "week") return addDays(anchor, direction * 7);
  return new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1);
}

export function notesCalendarTitle(view: NotesCalendarView, anchor: Date) {
  const range = notesCalendarRange(view, anchor);
  if (view === "month") {
    return anchor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  if (view === "day") {
    return anchor.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" });
  }
  const end = addDays(range.to, -1);
  return `${range.from.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

export function enumerateNotesCalendarDays(view: NotesCalendarView, anchor: Date) {
  const { from, to } = notesCalendarRange(view, anchor);
  const days: Date[] = [];
  for (let day = from; day.getTime() < to.getTime(); day = addDays(day, 1)) {
    days.push(day);
  }
  return days;
}

export function dayKey(date: Date | string) {
  const value = typeof date === "string" ? new Date(date) : date;
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
