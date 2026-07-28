import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ISSUE_BOARD_COLUMN_COLORS,
  ISSUE_STATUSES,
  type IssueBoardColumn,
  type IssueBoardColumnColor,
  type IssueStatus,
} from "@paperclipai/shared";
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
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
  const [editColumnId, setEditColumnId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editStatus, setEditStatus] = useState<IssueStatus>("todo");
  const [editColor, setEditColor] = useState<IssueBoardColumnColor>("blue");
  const [hideColumnId, setHideColumnId] = useState<string | null>(null);
  const [deleteColumnId, setDeleteColumnId] = useState<string | null>(null);
  const [destination, setDestination] = useState("");

  const orderedColumns = useMemo(
    () => [...columns].sort((a, b) =>
      a.position - b.position
      || a.createdAt.toString().localeCompare(b.createdAt.toString())
      || a.id.localeCompare(b.id)),
    [columns],
  );
  const visibleColumns = orderedColumns.filter((column) => !column.hidden);
  const hiddenSystemColumns = orderedColumns.filter((column) => column.isSystem && column.hidden);
  const editColumn = orderedColumns.find((column) => column.id === editColumnId) ?? null;
  const hideColumn = orderedColumns.find((column) => column.id === hideColumnId) ?? null;
  const deleteColumn = orderedColumns.find((column) => column.id === deleteColumnId) ?? null;
  const hideDestinations = hideColumn
    ? visibleColumns.filter((column) => !column.isSystem && column.status === hideColumn.status)
    : [];
  const deleteDestinations = deleteColumn
    ? visibleColumns.filter((column) => column.id !== deleteColumn.id && column.status === deleteColumn.status)
    : [];

  useEffect(() => {
    if (!open) {
      setEditColumnId(null);
      setHideColumnId(null);
      setDeleteColumnId(null);
      setDestination("");
    }
  }, [open]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(companyId) });

  const createMutation = useMutation({
    mutationFn: () => issueBoardColumnsApi.create(companyId, { name, status, color }),
    onSuccess: async (created) => {
      setName("");
      await refresh();
      pushToast({ title: `Column “${created.name}” added`, tone: "success" });
    },
    onError: (error) => pushToast({ title: "Could not add column", body: errorMessage(error), tone: "error" }),
  });

  const editMutation = useMutation({
    mutationFn: () => issueBoardColumnsApi.update(editColumnId!, {
      name: editName,
      color: editColor,
      ...(editColumn?.isSystem ? {} : { status: editStatus }),
    }),
    onSuccess: async (updated) => {
      setEditColumnId(null);
      await refresh();
      pushToast({ title: `Column “${updated.name}” updated`, tone: "success" });
    },
    onError: (error) => pushToast({ title: "Could not update column", body: errorMessage(error), tone: "error" }),
  });

  const reorderMutation = useMutation({
    mutationFn: (columnIds: string[]) => issueBoardColumnsApi.reorder(companyId, { columnIds }),
    onSuccess: (nextColumns) => {
      queryClient.setQueryData(queryKeys.issues.boardColumns(companyId), nextColumns);
    },
    onError: (error) => pushToast({ title: "Could not reorder columns", body: errorMessage(error), tone: "error" }),
  });

  const visibilityMutation = useMutation({
    mutationFn: ({ id, hidden, destinationColumnId }: {
      id: string;
      hidden: boolean;
      destinationColumnId: string | null;
    }) => issueBoardColumnsApi.setVisibility(id, { hidden, destinationColumnId }),
    onSuccess: async (result) => {
      setHideColumnId(null);
      setDestination("");
      await refresh();
      pushToast({
        title: result.column.hidden
          ? `Column “${result.column.name}” hidden`
          : `Column “${result.column.name}” restored`,
        body: result.movedTaskCount > 0
          ? `${result.movedTaskCount} task${result.movedTaskCount === 1 ? "" : "s"} moved safely.`
          : undefined,
        tone: "success",
      });
    },
    onError: (error) => pushToast({ title: "Could not change visibility", body: errorMessage(error), tone: "error" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => issueBoardColumnsApi.remove(deleteColumnId!, destination || null),
    onSuccess: async (result) => {
      setDeleteColumnId(null);
      setDestination("");
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

  const visibleTargetIndex = (index: number, direction: -1 | 1) => {
    for (let targetIndex = index + direction; targetIndex >= 0 && targetIndex < orderedColumns.length; targetIndex += direction) {
      if (!orderedColumns[targetIndex].hidden) return targetIndex;
    }
    return null;
  };

  const moveColumn = (columnId: string, direction: -1 | 1) => {
    const index = orderedColumns.findIndex((column) => column.id === columnId);
    const targetIndex = visibleTargetIndex(index, direction);
    if (index < 0 || targetIndex === null || reorderMutation.isPending) return;
    const next = [...orderedColumns];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    reorderMutation.mutate(next.map((column) => column.id));
  };

  const beginEdit = (column: IssueBoardColumn) => {
    setHideColumnId(null);
    setDeleteColumnId(null);
    setEditColumnId(column.id);
    setEditName(column.name);
    setEditStatus(column.status);
    setEditColor(column.color);
  };

  const beginHide = (column: IssueBoardColumn) => {
    setEditColumnId(null);
    setDeleteColumnId(null);
    setHideColumnId(column.id);
    const firstDestination = visibleColumns.find((candidate) =>
      !candidate.isSystem && candidate.status === column.status);
    setDestination(firstDestination?.id ?? "");
  };

  const beginDelete = (column: IssueBoardColumn) => {
    setEditColumnId(null);
    setHideColumnId(null);
    setDeleteColumnId(column.id);
    const systemDestination = visibleColumns.find((candidate) =>
      candidate.isSystem && candidate.status === column.status);
    const firstDestination = systemDestination
      ?? visibleColumns.find((candidate) => candidate.id !== column.id && candidate.status === column.status);
    setDestination(firstDestination?.id ?? "");
  };

  const isBusy = createMutation.isPending
    || editMutation.isPending
    || reorderMutation.isPending
    || visibilityMutation.isPending
    || deleteMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Manage board columns</DialogTitle>
          <DialogDescription>
            Rename, recolor, reorder, or hide system columns without changing the internal statuses used by Paperclip automation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto pr-1">
          <div className="space-y-2">
            <div className="text-sm font-medium">Visible columns</div>
            {visibleColumns.map((column) => {
              const index = orderedColumns.findIndex((candidate) => candidate.id === column.id);
              return (
                <div key={column.id} className="flex items-center gap-2 rounded-md border bg-background p-2">
                  <span className={cn("size-2.5 shrink-0 rounded-full", colorDots[column.color])} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 truncate text-sm font-medium">
                      {column.isSystem ? <ShieldCheck className="size-3.5 shrink-0 text-muted-foreground" /> : null}
                      <span className="truncate">{column.name}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {column.isSystem ? "System" : "Custom"} · {statusLabels[column.status]} · {column.taskCount} task{column.taskCount === 1 ? "" : "s"}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Move ${column.name} left`}
                    disabled={visibleTargetIndex(index, -1) === null || isBusy}
                    onClick={() => moveColumn(column.id, -1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Move ${column.name} right`}
                    disabled={visibleTargetIndex(index, 1) === null || isBusy}
                    onClick={() => moveColumn(column.id, 1)}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Edit ${column.name}`}
                    disabled={isBusy}
                    onClick={() => beginEdit(column)}
                  >
                    <Pencil />
                  </Button>
                  {column.isSystem ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Hide ${column.name}`}
                      disabled={isBusy}
                      onClick={() => beginHide(column)}
                    >
                      <EyeOff />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="text-destructive hover:text-destructive"
                      aria-label={`Delete ${column.name}`}
                      disabled={isBusy}
                      onClick={() => beginDelete(column)}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          {hiddenSystemColumns.length > 0 ? (
            <div className="space-y-2">
              <div className="text-sm font-medium">Hidden system columns</div>
              {hiddenSystemColumns.map((column) => (
                <div key={column.id} className="flex items-center gap-2 rounded-md border border-dashed bg-muted/20 p-2">
                  <span className={cn("size-2.5 shrink-0 rounded-full", colorDots[column.color])} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-muted-foreground">{column.name}</div>
                    <div className="text-xs text-muted-foreground">System · {statusLabels[column.status]}</div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => visibilityMutation.mutate({ id: column.id, hidden: false, destinationColumnId: null })}
                  >
                    <Eye className="size-3.5" />
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          {editColumn ? (
            <form
              className="space-y-3 rounded-md border border-primary/25 bg-primary/5 p-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (editName.trim()) editMutation.mutate();
              }}
            >
              <div className="text-sm font-medium">Edit “{editColumn.name}”</div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-3">
                  <Label htmlFor="edit-board-column-name">Name</Label>
                  <Input
                    id="edit-board-column-name"
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    maxLength={80}
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Internal status</Label>
                  {editColumn.isSystem ? (
                    <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground">
                      {statusLabels[editColumn.status]} (kept for automation)
                    </div>
                  ) : (
                    <Select
                      value={editStatus}
                      onValueChange={(value) => setEditStatus(value as IssueStatus)}
                      disabled={editColumn.taskCount > 0}
                    >
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ISSUE_STATUSES.map((item) => (
                          <SelectItem key={item} value={item}>{statusLabels[item]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Color</Label>
                  <Select value={editColor} onValueChange={(value) => setEditColor(value as IssueBoardColumnColor)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ISSUE_BOARD_COLUMN_COLORS.map((item) => (
                        <SelectItem key={item} value={item}>{colorLabels[item]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setEditColumnId(null)} disabled={isBusy}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={!editName.trim() || isBusy}>Save changes</Button>
              </div>
            </form>
          ) : null}

          {hideColumn ? (
            <div className="space-y-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
              <div>
                <div className="text-sm font-medium">Hide “{hideColumn.name}”?</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  The internal {statusLabels[hideColumn.status]} status will remain available to Paperclip automation.
                </p>
              </div>
              {hideColumn.taskCount > 0 ? (
                <div className="space-y-1.5">
                  <Label>Move {hideColumn.taskCount} task{hideColumn.taskCount === 1 ? "" : "s"} to</Label>
                  {hideDestinations.length > 0 ? (
                    <Select value={destination} onValueChange={setDestination}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {hideDestinations.map((column) => (
                          <SelectItem key={column.id} value={column.id}>{column.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                      Add a custom {statusLabels[hideColumn.status]} column first. This keeps the tasks’ internal status unchanged.
                    </p>
                  )}
                </div>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setHideColumnId(null)} disabled={isBusy}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => visibilityMutation.mutate({
                    id: hideColumn.id,
                    hidden: true,
                    destinationColumnId: destination || null,
                  })}
                  disabled={isBusy || (hideColumn.taskCount > 0 && !destination)}
                >
                  Hide column
                </Button>
              </div>
            </div>
          ) : null}

          {deleteColumn ? (
            <div className="space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <div>
                <div className="text-sm font-medium">Delete “{deleteColumn.name}”?</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  The custom column will be removed permanently. Its tasks will not be deleted.
                </p>
              </div>
              {deleteColumn.taskCount > 0 ? (
                <div className="space-y-1.5">
                  <Label>Move {deleteColumn.taskCount} task{deleteColumn.taskCount === 1 ? "" : "s"} to</Label>
                  {deleteDestinations.length > 0 ? (
                    <Select value={destination} onValueChange={setDestination}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {deleteDestinations.map((column) => (
                          <SelectItem key={column.id} value={column.id}>{column.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                      Restore or add another {statusLabels[deleteColumn.status]} column first.
                    </p>
                  )}
                </div>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setDeleteColumnId(null)} disabled={isBusy}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => deleteMutation.mutate()}
                  disabled={isBusy || (deleteColumn.taskCount > 0 && !destination)}
                >
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
                <Label>Internal status</Label>
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
