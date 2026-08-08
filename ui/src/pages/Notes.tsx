import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Calendar, CalendarEvent, CalendarMember } from "@paperclipai/shared";
import {
  Archive,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Mail,
  Plus,
  RefreshCcw,
  Save,
  Trash2,
  Users,
} from "lucide-react";
import { calendarsApi } from "../api/calendars";
import { ApiError } from "../api/client";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import {
  dayKey,
  enumerateNotesCalendarDays,
  notesCalendarRange,
  notesCalendarTitle,
  shiftNotesCalendarAnchor,
  type NotesCalendarView,
} from "../lib/calendar-view";
import { useLocation, useNavigate } from "@/lib/router";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

const DEFAULT_CALENDAR_COLOR = "#2563eb";
const NONE_VALUE = "__none__";

interface CalendarFormState {
  name: string;
  description: string;
  color: string;
}

interface EventFormState {
  title: string;
  note: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
}

function detectedTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function toDateTimeLocalValue(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function defaultEventForm(timezone = detectedTimezone()): EventFormState {
  const startsAt = addHours(new Date(), 1);
  return {
    title: "",
    note: "",
    startsAt: toDateTimeLocalValue(startsAt),
    endsAt: "",
    timezone,
  };
}

function apiErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 409) {
    return `${error.message} The local event version is stale; refresh and try again.`;
  }
  return error instanceof Error ? error.message : "Request failed";
}

function inviteLink(token: string) {
  if (typeof window === "undefined") return `/calendar-invitations/${encodeURIComponent(token)}`;
  return `${window.location.origin}/calendar-invitations/${encodeURIComponent(token)}`;
}

const dateHeaderFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

const eventTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDateHeader(date: Date) {
  return dateHeaderFormatter.format(date);
}

function formatEventTime(event: CalendarEvent) {
  const startsAt = eventTimeFormatter.format(new Date(event.startsAt));
  if (!event.endsAt) return startsAt;
  return `${startsAt} – ${eventTimeFormatter.format(new Date(event.endsAt))}`;
}

function buildEventPayload(form: EventFormState) {
  return {
    title: form.title.trim(),
    note: form.note.trim() ? form.note.trim() : null,
    startsAt: new Date(form.startsAt).toISOString(),
    endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
    timezone: form.timezone.trim() || detectedTimezone(),
  };
}

function isValidEventForm(form: EventFormState) {
  if (!form.title.trim() || !form.startsAt) return false;
  const startsAt = new Date(form.startsAt);
  if (Number.isNaN(startsAt.getTime())) return false;
  if (!form.endsAt) return true;
  const endsAt = new Date(form.endsAt);
  return !Number.isNaN(endsAt.getTime()) && endsAt.getTime() > startsAt.getTime();
}

function eventToForm(event: CalendarEvent): EventFormState {
  return {
    title: event.title,
    note: event.note ?? "",
    startsAt: toDateTimeLocalValue(event.startsAt),
    endsAt: toDateTimeLocalValue(event.endsAt),
    timezone: event.timezone,
  };
}

export function Notes() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [view, setView] = useState<NotesCalendarView>("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [visibleCalendarIds, setVisibleCalendarIds] = useState<Set<string>>(() => new Set());
  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [calendarForm, setCalendarForm] = useState<CalendarFormState>({
    name: "",
    description: "",
    color: DEFAULT_CALENDAR_COLOR,
  });
  const [calendarSettings, setCalendarSettings] = useState<CalendarFormState>({
    name: "",
    description: "",
    color: DEFAULT_CALENDAR_COLOR,
  });
  const [eventForm, setEventForm] = useState<EventFormState>(() => defaultEventForm());
  const [inviteUserId, setInviteUserId] = useState(NONE_VALUE);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [newCreatorUserId, setNewCreatorUserId] = useState(NONE_VALUE);
  const [preferencesForm, setPreferencesForm] = useState({
    timezone: detectedTimezone(),
    eventRemindersEnabled: true,
  });

  useEffect(() => {
    setBreadcrumbs([{ label: "Notes" }]);
  }, [setBreadcrumbs]);

  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);

  useEffect(() => {
    const calendarId = searchParams.get("calendarId");
    const eventId = searchParams.get("eventId");
    if (calendarId) setSelectedCalendarId(calendarId);
    if (eventId) setSelectedEventId(eventId);
  }, [searchParams]);

  const calendarsQuery = useQuery({
    queryKey: queryKeys.calendars.list(selectedCompanyId ?? "", false),
    queryFn: () => calendarsApi.list(selectedCompanyId!, false),
    enabled: !!selectedCompanyId,
  });

  const preferencesQuery = useQuery({
    queryKey: queryKeys.calendars.notificationPreferences,
    queryFn: calendarsApi.getNotificationPreferences,
    enabled: !!selectedCompanyId,
  });

  const calendars = useMemo(() => calendarsQuery.data ?? [], [calendarsQuery.data]);
  const selectedCalendar = calendars.find((calendar) => calendar.id === selectedCalendarId) ?? null;
  const canManageSelectedCalendar = selectedCalendar?.memberRole === "creator";
  const range = useMemo(() => notesCalendarRange(view, anchor), [view, anchor]);
  const rangeFromIso = range.from.toISOString();
  const rangeToIso = range.to.toISOString();
  const days = useMemo(() => enumerateNotesCalendarDays(view, anchor), [view, anchor]);
  const visibleIds = useMemo(() => [...visibleCalendarIds], [visibleCalendarIds]);

  const eventsQuery = useQuery({
    queryKey: queryKeys.calendars.events(selectedCompanyId ?? "", rangeFromIso, rangeToIso, visibleIds),
    queryFn: () => calendarsApi.listEvents(selectedCompanyId!, {
      from: rangeFromIso,
      to: rangeToIso,
      calendarIds: visibleIds,
    }),
    enabled: !!selectedCompanyId && visibleIds.length > 0,
  });

  const events = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data]);
  const selectedEventInRange = events.find((event) => event.id === selectedEventId) ?? null;

  const selectedEventQuery = useQuery({
    queryKey: ["calendar-events", "detail", selectedEventId],
    queryFn: () => calendarsApi.getEvent(selectedEventId!),
    enabled: !!selectedEventId && !selectedEventInRange,
  });

  const selectedEvent = selectedEventInRange ?? selectedEventQuery.data ?? null;

  const membersQuery = useQuery({
    queryKey: queryKeys.calendars.members(selectedCalendarId ?? ""),
    queryFn: () => calendarsApi.members(selectedCalendarId!),
    enabled: !!selectedCalendarId,
  });

  const inviteCandidatesQuery = useQuery({
    queryKey: queryKeys.calendars.inviteCandidates(selectedCalendarId ?? ""),
    queryFn: () => calendarsApi.inviteCandidates(selectedCalendarId!),
    enabled: !!selectedCalendarId && canManageSelectedCalendar,
  });

  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);
  const inviteCandidates = useMemo(() => inviteCandidatesQuery.data ?? [], [inviteCandidatesQuery.data]);

  const calendarById = useMemo(() => {
    const map = new Map<string, Calendar>();
    for (const calendar of calendars) map.set(calendar.id, calendar);
    return map;
  }, [calendars]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = dayKey(event.startsAt);
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    return map;
  }, [events]);

  useEffect(() => {
    const calendarId = searchParams.get("calendarId");
    const activeIds = calendars.filter((calendar) => calendar.status === "active").map((calendar) => calendar.id);
    setVisibleCalendarIds((current) => {
      const activeSet = new Set(activeIds);
      const retained = [...current].filter((id) => activeSet.has(id));
      if (retained.length > 0) return new Set(retained);
      return new Set(activeIds);
    });
    setSelectedCalendarId((current) => {
      if (current && activeIds.includes(current)) return current;
      if (calendarId && activeIds.includes(calendarId)) return calendarId;
      return activeIds[0] ?? null;
    });
  }, [calendars, searchParams]);

  useEffect(() => {
    if (!selectedCalendar) return;
    setCalendarSettings({
      name: selectedCalendar.name,
      description: selectedCalendar.description ?? "",
      color: selectedCalendar.color,
    });
  }, [selectedCalendar]);

  useEffect(() => {
    if (!selectedEvent) return;
    setSelectedCalendarId(selectedEvent.calendarId);
    setEventForm(eventToForm(selectedEvent));
  }, [selectedEvent]);

  useEffect(() => {
    if (!preferencesQuery.data) return;
    setPreferencesForm(preferencesQuery.data);
    setEventForm((current) => ({
      ...current,
      timezone: current.timezone || preferencesQuery.data.timezone,
    }));
  }, [preferencesQuery.data]);

  const invalidateCalendars = () => {
    if (!selectedCompanyId) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.calendars.list(selectedCompanyId, false) });
    queryClient.invalidateQueries({ queryKey: ["calendar-events", selectedCompanyId] });
  };

  const invalidateSelectedCalendar = () => {
    if (!selectedCalendarId) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.calendars.members(selectedCalendarId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.calendars.inviteCandidates(selectedCalendarId) });
  };

  const createCalendarMutation = useMutation({
    mutationFn: () => {
      if (!selectedCompanyId) throw new Error("Select a company first");
      return calendarsApi.create(selectedCompanyId, {
        name: calendarForm.name.trim(),
        description: calendarForm.description.trim() || null,
        color: calendarForm.color,
      });
    },
    onSuccess: (calendar) => {
      setCalendarForm({ name: "", description: "", color: DEFAULT_CALENDAR_COLOR });
      setSelectedCalendarId(calendar.id);
      setVisibleCalendarIds((current) => new Set([...current, calendar.id]));
      setNotice("Calendar created.");
      invalidateCalendars();
    },
    onError: (error) => setNotice(apiErrorMessage(error)),
  });

  const updateCalendarMutation = useMutation({
    mutationFn: () => {
      if (!selectedCalendarId) throw new Error("Select a calendar first");
      return calendarsApi.update(selectedCalendarId, {
        name: calendarSettings.name.trim(),
        description: calendarSettings.description.trim() || null,
        color: calendarSettings.color,
      });
    },
    onSuccess: (calendar) => {
      setSelectedCalendarId(calendar.id);
      setNotice("Calendar updated.");
      invalidateCalendars();
    },
    onError: (error) => setNotice(apiErrorMessage(error)),
  });

  const archiveCalendarMutation = useMutation({
    mutationFn: () => {
      if (!selectedCalendarId) throw new Error("Select a calendar first");
      return calendarsApi.archive(selectedCalendarId);
    },
    onSuccess: () => {
      setNotice("Calendar archived.");
      setSelectedCalendarId(null);
      setSelectedEventId(null);
      invalidateCalendars();
    },
    onError: (error) => setNotice(apiErrorMessage(error)),
  });

  const deleteCalendarMutation = useMutation({
    mutationFn: () => {
      if (!selectedCalendarId) throw new Error("Select a calendar first");
      return calendarsApi.remove(selectedCalendarId, { confirm: true });
    },
    onSuccess: () => {
      setNotice("Calendar deleted.");
      setSelectedCalendarId(null);
      setSelectedEventId(null);
      invalidateCalendars();
    },
    onError: (error) => setNotice(apiErrorMessage(error)),
  });

  const createInvitationMutation = useMutation({
    mutationFn: () => {
      if (!selectedCalendarId) throw new Error("Select a calendar first");
      if (inviteUserId !== NONE_VALUE) {
        return calendarsApi.createInvitation(selectedCalendarId, { invitedUserId: inviteUserId });
      }
      if (inviteEmail.trim()) {
        return calendarsApi.createInvitation(selectedCalendarId, { invitedEmail: inviteEmail.trim() });
      }
      throw new Error("Choose a user or enter an email");
    },
    onSuccess: (invitation) => {
      setInviteToken(invitation.inviteToken ?? null);
      setInviteUserId(NONE_VALUE);
      setInviteEmail("");
      setNotice("Invitation created.");
      invalidateSelectedCalendar();
    },
    onError: (error) => setNotice(apiErrorMessage(error)),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (targetUserId: string) => {
      if (!selectedCalendarId) throw new Error("Select a calendar first");
      return calendarsApi.removeMember(selectedCalendarId, targetUserId);
    },
    onSuccess: () => {
      setNotice("Member removed.");
      invalidateSelectedCalendar();
      invalidateCalendars();
    },
    onError: (error) => setNotice(apiErrorMessage(error)),
  });

  const leaveCalendarMutation = useMutation({
    mutationFn: () => {
      if (!selectedCalendarId) throw new Error("Select a calendar first");
      return calendarsApi.leave(selectedCalendarId);
    },
    onSuccess: () => {
      setNotice("You left the calendar.");
      setSelectedCalendarId(null);
      setSelectedEventId(null);
      invalidateCalendars();
    },
    onError: (error) => setNotice(apiErrorMessage(error)),
  });

  const transferOwnershipMutation = useMutation({
    mutationFn: () => {
      if (!selectedCalendarId) throw new Error("Select a calendar first");
      if (newCreatorUserId === NONE_VALUE) throw new Error("Choose the new creator");
      return calendarsApi.transferOwnership(selectedCalendarId, {
        newCreatorUserId,
        confirm: true,
      });
    },
    onSuccess: () => {
      setNewCreatorUserId(NONE_VALUE);
      setNotice("Ownership transferred.");
      invalidateSelectedCalendar();
      invalidateCalendars();
    },
    onError: (error) => setNotice(apiErrorMessage(error)),
  });

  const savePreferencesMutation = useMutation({
    mutationFn: () => calendarsApi.updateNotificationPreferences(preferencesForm),
    onSuccess: (saved) => {
      setPreferencesForm(saved);
      setNotice("Reminder preferences saved.");
      queryClient.invalidateQueries({ queryKey: queryKeys.calendars.notificationPreferences });
    },
    onError: (error) => setNotice(apiErrorMessage(error)),
  });

  const saveEventMutation = useMutation({
    mutationFn: () => {
      if (!isValidEventForm(eventForm)) throw new Error("Enter a title and a valid time range");
      const payload = buildEventPayload(eventForm);
      if (selectedEvent) {
        return calendarsApi.updateEvent(selectedEvent.id, {
          ...payload,
          expectedVersion: selectedEvent.version,
        });
      }
      if (!selectedCalendarId) throw new Error("Select a calendar first");
      return calendarsApi.createEvent(selectedCalendarId, payload);
    },
    onSuccess: (event) => {
      setSelectedEventId(event.id);
      setSelectedCalendarId(event.calendarId);
      setEventForm(eventToForm(event));
      setNotice(selectedEvent ? "Event updated." : "Event created.");
      if (selectedCompanyId) queryClient.invalidateQueries({ queryKey: ["calendar-events", selectedCompanyId] });
    },
    onError: (error) => setNotice(apiErrorMessage(error)),
  });

  const deleteEventMutation = useMutation({
    mutationFn: () => {
      if (!selectedEvent) throw new Error("Select an event first");
      return calendarsApi.deleteEvent(selectedEvent.id, selectedEvent.version);
    },
    onSuccess: () => {
      setSelectedEventId(null);
      setEventForm(defaultEventForm(preferencesForm.timezone));
      setNotice("Event deleted.");
      if (selectedCompanyId) queryClient.invalidateQueries({ queryKey: ["calendar-events", selectedCompanyId] });
    },
    onError: (error) => setNotice(apiErrorMessage(error)),
  });

  const handleCreateCalendar = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!calendarForm.name.trim()) {
      setNotice("Calendar name is required.");
      return;
    }
    createCalendarMutation.mutate();
  };

  const handleUpdateCalendar = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!calendarSettings.name.trim()) {
      setNotice("Calendar name is required.");
      return;
    }
    updateCalendarMutation.mutate();
  };

  const handleSaveEvent = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    saveEventMutation.mutate();
  };

  const startNewEvent = (calendarId = selectedCalendarId) => {
    setSelectedEventId(null);
    if (calendarId) setSelectedCalendarId(calendarId);
    setEventForm(defaultEventForm(preferencesForm.timezone));
  };

  const toggleCalendar = (calendarId: string) => {
    setVisibleCalendarIds((current) => {
      const next = new Set(current);
      if (next.has(calendarId)) next.delete(calendarId);
      else next.add(calendarId);
      return next;
    });
  };

  const selectableMembers = members.filter((member) => member.userId !== selectedCalendar?.creatorUserId);

  if (!selectedCompanyId) {
    return <EmptyState icon={CalendarDays} message="Select a company to open notes." />;
  }

  if (calendarsQuery.isLoading) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notes</h1>
          <p className="text-sm text-muted-foreground">
            Shared owner-only calendars with event notes and 3-hour email reminders.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => eventsQuery.refetch()}>
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => startNewEvent()}>
            <Plus className="h-4 w-4" />
            New event
          </Button>
        </div>
      </div>

      {notice ? (
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {notice}
        </div>
      ) : null}

      {calendars.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No calendars yet"
          message="Create a shared calendar for owner-only notes and reminders."
        />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
        <Card className="py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-base">Calendars</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 px-4">
            <div className="space-y-2">
              {calendars.map((calendar) => (
                <div
                  key={calendar.id}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                    selectedCalendarId === calendar.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
                  )}
                >
                  <Checkbox
                    checked={visibleCalendarIds.has(calendar.id)}
                    onCheckedChange={() => toggleCalendar(calendar.id)}
                    aria-label={`Show ${calendar.name}`}
                  />
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => setSelectedCalendarId(calendar.id)}
                  >
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: calendar.color }} />
                    <span className="min-w-0 flex-1 truncate">{calendar.name}</span>
                    <Badge variant={calendar.memberRole === "creator" ? "default" : "secondary"}>
                      {calendar.memberRole}
                    </Badge>
                  </button>
                </div>
              ))}
            </div>

            <form className="space-y-2 border-t pt-4" onSubmit={handleCreateCalendar}>
              <Label htmlFor="new-calendar-name">New calendar</Label>
              <Input
                id="new-calendar-name"
                value={calendarForm.name}
                onChange={(event) => setCalendarForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Calendar name"
              />
              <Textarea
                value={calendarForm.description}
                onChange={(event) => setCalendarForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Description"
                rows={3}
              />
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  className="h-9 w-14 p-1"
                  value={calendarForm.color}
                  onChange={(event) => setCalendarForm((current) => ({ ...current, color: event.target.value }))}
                  aria-label="Calendar color"
                />
                <Button type="submit" size="sm" disabled={createCalendarMutation.isPending}>
                  <Plus className="h-4 w-4" />
                  Create
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="py-4">
          <CardHeader className="px-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="text-base">{notesCalendarTitle(view, anchor)}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {visibleIds.length === 0 ? "No calendars selected" : `${visibleIds.length} calendar(s) visible`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Previous range"
                  onClick={() => setAnchor((current) => shiftNotesCalendarAnchor(view, current, -1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>
                  Today
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Next range"
                  onClick={() => setAnchor((current) => shiftNotesCalendarAnchor(view, current, 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Tabs value={view} onValueChange={(value) => setView(value as NotesCalendarView)}>
                  <TabsList>
                    <TabsTrigger value="month">Month</TabsTrigger>
                    <TabsTrigger value="week">Week</TabsTrigger>
                    <TabsTrigger value="day">Day</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-4">
            {eventsQuery.isLoading ? (
              <PageSkeleton variant="list" />
            ) : (
              <div className={cn("grid gap-2", view === "day" ? "grid-cols-1" : "md:grid-cols-2 xl:grid-cols-3")}>
                {days.map((day) => {
                  const key = dayKey(day);
                  const dayEvents = eventsByDay.get(key) ?? [];
                  return (
                    <div key={key} className="min-h-32 rounded-lg border border-border bg-background p-3">
                      <div className="mb-3 flex items-center justify-between text-sm">
                        <span className="font-medium">{formatDateHeader(day)}</span>
                        <span className="text-muted-foreground">{dayEvents.length}</span>
                      </div>
                      <div className="space-y-2">
                        {dayEvents.map((event) => {
                          const calendar = calendarById.get(event.calendarId);
                          return (
                            <button
                              key={event.id}
                              type="button"
                              className={cn(
                                "w-full rounded-md border bg-card p-2 text-left text-xs transition-colors hover:bg-muted/50",
                                selectedEventId === event.id ? "border-primary" : "border-border",
                              )}
                              style={{ borderLeftColor: calendar?.color ?? DEFAULT_CALENDAR_COLOR, borderLeftWidth: 4 }}
                              onClick={() => {
                                setSelectedEventId(event.id);
                                setSelectedCalendarId(event.calendarId);
                              }}
                            >
                              <div className="font-medium text-foreground">{event.title}</div>
                              <div className="mt-1 text-muted-foreground">{formatEventTime(event)}</div>
                              {calendar ? <div className="mt-1 truncate text-muted-foreground">{calendar.name}</div> : null}
                            </button>
                          );
                        })}
                        {dayEvents.length === 0 ? (
                          <p className="py-3 text-center text-xs text-muted-foreground">No events</p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-base">{selectedEvent ? "Edit event" : "New event"}</CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              <form className="space-y-3" onSubmit={handleSaveEvent}>
                <div className="space-y-1.5">
                  <Label>Calendar</Label>
                  <Select
                    value={selectedCalendarId ?? NONE_VALUE}
                    onValueChange={(value) => {
                      if (value !== NONE_VALUE) setSelectedCalendarId(value);
                    }}
                    disabled={!!selectedEvent}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose calendar" />
                    </SelectTrigger>
                    <SelectContent>
                      {calendars.map((calendar) => (
                        <SelectItem key={calendar.id} value={calendar.id}>
                          {calendar.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="event-title">Title</Label>
                  <Input
                    id="event-title"
                    value={eventForm.title}
                    onChange={(event) => setEventForm((current) => ({ ...current, title: event.target.value }))}
                    placeholder="Event title"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="event-start">Start</Label>
                    <Input
                      id="event-start"
                      type="datetime-local"
                      value={eventForm.startsAt}
                      onChange={(event) => setEventForm((current) => ({ ...current, startsAt: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="event-end">End</Label>
                    <Input
                      id="event-end"
                      type="datetime-local"
                      value={eventForm.endsAt}
                      onChange={(event) => setEventForm((current) => ({ ...current, endsAt: event.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="event-timezone">Timezone</Label>
                  <Input
                    id="event-timezone"
                    value={eventForm.timezone}
                    onChange={(event) => setEventForm((current) => ({ ...current, timezone: event.target.value }))}
                    placeholder="Europe/Moscow"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="event-note">Note</Label>
                  <Textarea
                    id="event-note"
                    value={eventForm.note}
                    onChange={(event) => setEventForm((current) => ({ ...current, note: event.target.value }))}
                    placeholder="Event notes"
                    rows={6}
                  />
                </div>
                {selectedEvent ? (
                  <p className="text-xs text-muted-foreground">
                    Version {selectedEvent.version}. Updates and deletes use this version for optimistic concurrency.
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="submit" size="sm" disabled={saveEventMutation.isPending}>
                    <Save className="h-4 w-4" />
                    Save event
                  </Button>
                  {selectedEvent ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => startNewEvent(selectedEvent.calendarId)}
                      >
                        New instead
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button type="button" variant="destructive" size="sm">
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete event?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently remove the event note from the shared calendar.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteEventMutation.mutate()}>
                              Delete event
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  ) : null}
                </div>
              </form>
            </CardContent>
          </Card>

          {selectedCalendar ? (
            <Card className="py-4">
              <CardHeader className="px-4">
                <CardTitle className="text-base">Calendar settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 px-4">
                <form className="space-y-3" onSubmit={handleUpdateCalendar}>
                  <Input
                    value={calendarSettings.name}
                    onChange={(event) => setCalendarSettings((current) => ({ ...current, name: event.target.value }))}
                    disabled={!canManageSelectedCalendar}
                  />
                  <Textarea
                    value={calendarSettings.description}
                    onChange={(event) => setCalendarSettings((current) => ({ ...current, description: event.target.value }))}
                    disabled={!canManageSelectedCalendar}
                    rows={3}
                  />
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      className="h-9 w-14 p-1"
                      value={calendarSettings.color}
                      onChange={(event) => setCalendarSettings((current) => ({ ...current, color: event.target.value }))}
                      disabled={!canManageSelectedCalendar}
                      aria-label="Calendar color"
                    />
                    {canManageSelectedCalendar ? (
                      <Button type="submit" size="sm" disabled={updateCalendarMutation.isPending}>
                        Save calendar
                      </Button>
                    ) : (
                      <Button type="button" variant="outline" size="sm" onClick={() => leaveCalendarMutation.mutate()}>
                        Leave calendar
                      </Button>
                    )}
                  </div>
                </form>

                <div className="space-y-3 border-t pt-4">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-medium">Members</p>
                  </div>
                  <div className="space-y-2">
                    {members.map((member) => (
                      <MemberRow
                        key={member.id}
                        member={member}
                        canManage={canManageSelectedCalendar}
                        isCreator={member.userId === selectedCalendar.creatorUserId}
                        onRemove={() => removeMemberMutation.mutate(member.userId)}
                      />
                    ))}
                  </div>
                </div>

                {canManageSelectedCalendar ? (
                  <>
                    <div className="space-y-3 border-t pt-4">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm font-medium">Invite owner</p>
                      </div>
                      <Select value={inviteUserId} onValueChange={setInviteUserId}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Choose owner" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE_VALUE}>No selected user</SelectItem>
                          {inviteCandidates.map((candidate) => (
                            <SelectItem key={candidate.userId} value={candidate.userId}>
                              {candidate.name ?? candidate.email ?? candidate.userId}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        value={inviteEmail}
                        onChange={(event) => setInviteEmail(event.target.value)}
                        placeholder="or owner email"
                        type="email"
                      />
                      <Button
                        size="sm"
                        onClick={() => createInvitationMutation.mutate()}
                        disabled={createInvitationMutation.isPending}
                      >
                        Create invitation
                      </Button>
                      {inviteToken ? (
                        <div className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
                          Invitation link: <span className="break-all text-foreground">{inviteLink(inviteToken)}</span>
                        </div>
                      ) : null}
                    </div>

                    <div className="space-y-3 border-t pt-4">
                      <p className="text-sm font-medium">Transfer ownership</p>
                      <Select value={newCreatorUserId} onValueChange={setNewCreatorUserId}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Choose member" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE_VALUE}>No selected member</SelectItem>
                          {selectableMembers.map((member) => (
                            <SelectItem key={member.userId} value={member.userId}>
                              {member.name ?? member.email ?? member.userId}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => transferOwnershipMutation.mutate()}
                        disabled={transferOwnershipMutation.isPending || newCreatorUserId === NONE_VALUE}
                      >
                        Transfer creator role
                      </Button>
                    </div>

                    <div className="flex flex-wrap gap-2 border-t pt-4">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Archive className="h-4 w-4" />
                            Archive
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Archive calendar?</AlertDialogTitle>
                            <AlertDialogDescription>
                              The calendar will disappear from the active notes view and pending reminders will be cancelled.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => archiveCalendarMutation.mutate()}>
                              Archive calendar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm">
                            <Trash2 className="h-4 w-4" />
                            Delete calendar
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete calendar permanently?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This deletes the calendar, all event notes, and reminder rows. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteCalendarMutation.mutate()}>
                              Delete calendar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card className="py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-base">Reminder preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-4">
              <div className="space-y-1.5">
                <Label htmlFor="reminder-timezone">Timezone for email reminders</Label>
                <Input
                  id="reminder-timezone"
                  value={preferencesForm.timezone}
                  onChange={(event) => setPreferencesForm((current) => ({ ...current, timezone: event.target.value }))}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={preferencesForm.eventRemindersEnabled}
                  onCheckedChange={(checked) => setPreferencesForm((current) => ({
                    ...current,
                    eventRemindersEnabled: checked === true,
                  }))}
                />
                Email me 3 hours before calendar events
              </label>
              <Button
                size="sm"
                variant="outline"
                onClick={() => savePreferencesMutation.mutate()}
                disabled={savePreferencesMutation.isPending}
              >
                Save reminder preferences
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MemberRow({
  member,
  canManage,
  isCreator,
  onRemove,
}: {
  member: CalendarMember;
  canManage: boolean;
  isCreator: boolean;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{member.name ?? member.email ?? member.userId}</div>
        <div className="truncate text-xs text-muted-foreground">{member.email ?? member.userId}</div>
      </div>
      <Badge variant={isCreator ? "default" : "secondary"}>{member.role}</Badge>
      {canManage && !isCreator ? (
        <Button variant="ghost" size="icon-xs" aria-label="Remove member" onClick={onRemove}>
          <Trash2 className="h-3 w-3" />
        </Button>
      ) : null}
    </div>
  );
}
