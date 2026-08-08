import { useMutation } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { calendarsApi } from "../api/calendars";
import { ApiError } from "../api/client";
import { EmptyState } from "../components/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate, useParams } from "@/lib/router";

function invitationErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 401) {
    return "Sign in with the invited email address, then return to this link.";
  }
  return error instanceof Error ? error.message : "Failed to accept invitation";
}

export function CalendarInvitationAccept() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const acceptMutation = useMutation({
    mutationFn: () => {
      if (!token) throw new Error("Invitation token is missing");
      return calendarsApi.acceptInvitation(token);
    },
  });

  if (!token) {
    return <EmptyState icon={CalendarDays} message="Calendar invitation token is missing." />;
  }

  return (
    <div className="mx-auto max-w-xl py-10">
      <Card>
        <CardHeader>
          <CardTitle>Calendar invitation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {acceptMutation.data ? (
            <>
              <p className="text-sm text-muted-foreground">
                Invitation accepted. The shared calendar is now available in Notes.
              </p>
              <Button onClick={() => navigate(`/notes?calendarId=${acceptMutation.data.calendarId}`)}>
                Open Notes
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Accept this invitation while signed in with the invited email address.
              </p>
              {acceptMutation.error ? (
                <p className="text-sm text-destructive">{invitationErrorMessage(acceptMutation.error)}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => acceptMutation.mutate()} disabled={acceptMutation.isPending}>
                  Accept invitation
                </Button>
                <Button variant="outline" onClick={() => navigate("/auth")}>
                  Sign in
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
