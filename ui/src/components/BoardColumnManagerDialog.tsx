import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ISSUE_BOARD_COLUMN_COLORS,
  ISSUE_STATUSES,
  type IssueBoardColumn,
  type IssueBoardColumnColor,
  type IssueStatus,
} from "@paperclipai/shared";
import { ArrowDown, ArrowUp, LockKeyhole, Plus, Trash2 } from "lucide-react";
import { issueBoardColumnsApi } from "../api/issue-board-columns";
import { useToastActions } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const statusLabels: Record<IssueStatus, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In progress",
  in_review: "In review",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

const colorLabels: Record<IssueBoardColumnColor, string> = {
  gray: "Gray",
  yellow: "Yellow",
  blue: "Blue",
  purple: "Purple",
  red: "Red",
  green: "Green",
};

const colorDots: Record<IssueBoardColumnColor, string> = {
  gray: "bg-neutral-400",
  yellow: "bg-amber-400",
  blue: "bg-blue-500",
  purple: "bg-violet-500",
  red: "bg-red-500",
  green: "bg-green-500",
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong";
}

interface BoardColumnManagerDialogProps {
  companyId: string;
  columns: IssueBoardColumn[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BoardColumnManagerDialog({
  companyId,
  columns,
  open,
  onOpenChange,
}: BoardColumnManagerDialogProps) {
  const queryClient = useQueryClient();
  const { pushToast } = useToastActions();
  const [name, setName] = useState("");
  const [status, setStatus] = useState<IssueStatus>("todo");
  const [color, setColor] = useState<IssueBoardColumnColor>("blue");
  const [deleteColumnId, setDeleteColumnId] = useState<string | null>(null);
  const [destination, setDestination] = useState("system");
  const orderedColumns = useMemo(
    () => ISSUE_STATUSES.flatMap((columnStatus) => columns
      .filter((column) => column.status === columnStatus)
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))),
    [columns],
  );
  const deleteColumn = orderedColumns.find((column) => column.id === deleteColumnId) ?? null;
  const deleteDestinations = deleteColumn
    ? orderedColumns.filter((column) => column.id !== deleteColumn.id && column.status === deleteColumn.status)
    : [];

  useEffect(() => {
    if (!open) {
      setDeleteColumnId(null);
      setDestination("system");
    }
  }, [open]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.issues.boardColumns(companyId) });

  const createMutation = useMutation({
    mutationFn: () => issueBoardColumnsApi.create(companyId, { name, status, color }),
    onSuccess: async (created) => {
      setName("");
      await refresh();
      pushToast({ title: `Column “${created.name}” added`, tone: "success" });
    },
    onError: (error) => pushToast({ title: "Could not add column", body: errorMessage(error), tone: "error" }),
  });

  const reorderMutation = useMutation({
    mutationFn: (columnIds: string[]) => issueBoardColumnsApi.reorder(companyId, { columnIds }),
    onSuccess: (nextColumns) => {
      queryClient.setQueryData(queryKeys.issues.boardColumns(companyId), nextColumns);
    },
    onError: (error) => pushToast({ title: "Could not reorder columns", body: errorMessage(error), tone: "error" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => issueBoardColumnsApi.remove(
      deleteColumnId!,
      destination === "system" ? null : destination,
    ),
    onSuccess: async (result) => {
      setDeleteColumnId(null);
      setDestination("system");
      await refresh();
      pushToast({
        title: `Column “${result.deleted.name}” deleted`,
        body: result.movedTaskCount > 0
          ? `${result.movedTaskCount} task${result.movedTaskCount === 1 ? "" : "s"} moved safely.`
          : undefined,
        tone: "success",
      });
    },
    onError: (error) => pushToast({ title: "Could not delete column", body: errorMessage(error), tone: "error" }),
  });

  const moveTargetIndex = (index: number, direction: -1 | 1) => {
    const column = orderedColumns[index];
    for (let targetIndex = index + direction; targetIndex >= 0 && targetIndex < orderedColumns.length; targetIndex += direction) {
      if (orderedColumns[targetIndex].status === column.status) return targetIndex;
    }
    return null;
  };

  const moveColumn = (index: number, direction: -1 | 1) => {
    const targetIndex = moveTargetIndex(index, direction);
    if (targetIndex === null || reorderMutation.isPending) return;
    const next = [...orderedColumns];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    reorderMutation.mutate(next.map((column) => column.id));
  };

  const isBusy = createMutation.isPending || reorderMutation.isPending || deleteMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manage board columns</DialogTitle>
          <DialogDescription>
            System columns keep Paperclip automation working. Add custom columns for your team’s workflow.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto pr-1">
          <div className="rounded-md border bg-muted/20 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <LockKeyhole className="size-3.5" />
              Protected system columns
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ISSUE_STATUSES.map((item) => (
                <span key={item} className="rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground">
                  {statusLabels[item]}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Custom columns</div>
            {orderedColumns.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                No custom columns yet.
              </div>
            ) : orderedColumns.map((column, index) => (
              <div key={column.id} className="flex items-center gap-2 rounded-md border bg-background p-2">
                <span className={cn("size-2.5 shrink-0 rounded-full", colorDots[column.color])} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{column.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {statusLabels[column.status]} · {column.taskCount} task{column.taskCount === 1 ? "" : "s"}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Move ${column.name} up`}
                  disabled={moveTargetIndex(index, -1) === null || isBusy}
                  onClick={() => moveColumn(index, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Move ${column.name} down`}
                  disabled={moveTargetIndex(index, 1) === null || isBusy}
                  onClick={() => moveColumn(index, 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="text-destructive hover:text-destructive"
                  aria-label={`Delete ${column.name}`}
                  disabled={isBusy}
                  onClick={() => {
                    setDeleteColumnId(column.id);
                    setDestination("system");
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>

          {deleteColumn ? (
            <div className="space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <div>
                <div className="text-sm font-medium">Delete “{deleteColumn.name}”?</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  The column will be removed permanently. Its tasks will not be deleted.
                </p>
              </div>
              {deleteColumn.taskCount > 0 ? (
                <div className="space-y-1.5">
                  <Label htmlFor="board-column-destination">Move {deleteColumn.taskCount} tasks to</Label>
                  <Select value={destination} onValueChange={setDestination}>
                    <SelectTrigger id="board-column-destination" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="system">System {statusLabels[deleteColumn.status]}</SelectItem>
                      {deleteDestinations.map((column) => (
                        <SelectItem key={column.id} value={column.id}>{column.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setDeleteColumnId(null)} disabled={isBusy}>
                  Cancel
                </Button>
                <Button type="button" variant="destructive" size="sm" onClick={() => deleteMutation.mutate()} disabled={isBusy}>
                  Delete column
                </Button>
              </div>
            </div>
          ) : null}

          <form
            className="space-y-3 rounded-md border p-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim()) createMutation.mutate();
            }}
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <Plus className="size-4" />
              Add custom column
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-3">
                <Label htmlFor="new-board-column-name">Name</Label>
                <Input
                  id="new-board-column-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="For example: Ready for QA"
                  maxLength={80}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>System status</Label>
                <Select value={status} onValueChange={(value) => setStatus(value as IssueStatus)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ISSUE_STATUSES.map((item) => (
                      <SelectItem key={item} value={item}>{statusLabels[item]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Color</Label>
                <Select value={color} onValueChange={(value) => setColor(value as IssueBoardColumnColor)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ISSUE_BOARD_COLUMN_COLORS.map((item) => (
                      <SelectItem key={item} value={item}>{colorLabels[item]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={!name.trim() || isBusy}>Add column</Button>
            </div>
          </form>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isBusy}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
