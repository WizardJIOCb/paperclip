import { and, asc, eq, max, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { issueBoardColumns, issues } from "@paperclipai/db";
import type {
  CreateIssueBoardColumn,
  DeleteIssueBoardColumnResult,
  IssueBoardColumn,
  IssueBoardColumnColor,
  IssueStatus,
  ReorderIssueBoardColumns,
  SetIssueBoardColumnVisibilityResult,
  UpdateIssueBoardColumn,
} from "@paperclipai/shared";
import { conflict, notFound } from "../errors.js";

type ColumnRow = typeof issueBoardColumns.$inferSelect;

const SYSTEM_COLUMN_DEFAULTS = [
  { status: "backlog", name: "Backlog", color: "gray" },
  { status: "todo", name: "Todo", color: "yellow" },
  { status: "in_progress", name: "In progress", color: "blue" },
  { status: "in_review", name: "In review", color: "purple" },
  { status: "blocked", name: "Blocked", color: "red" },
  { status: "done", name: "Done", color: "green" },
  { status: "cancelled", name: "Cancelled", color: "gray" },
] as const satisfies readonly {
  status: IssueStatus;
  name: string;
  color: IssueBoardColumnColor;
}[];

function isPostgresError(error: unknown, code: string) {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

export function issueBoardColumnService(db: Db, mutationLockHeld = false) {
  async function withCompanyLock<T>(companyId: string, operation: (lockedDb: Db) => Promise<T>) {
    if (mutationLockHeld) return operation(db);
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`paperclip:issue-board-columns:${companyId}`}, 0))`);
      return operation(tx as unknown as Db);
    });
  }

  async function getRow(id: string): Promise<ColumnRow | null> {
    return db
      .select()
      .from(issueBoardColumns)
      .where(eq(issueBoardColumns.id, id))
      .then((rows) => rows[0] ?? null);
  }

  async function ensureSystemColumns(companyId: string) {
    const existingSystemRows = await db
      .select({ status: issueBoardColumns.status })
      .from(issueBoardColumns)
      .where(and(eq(issueBoardColumns.companyId, companyId), eq(issueBoardColumns.isSystem, true)));
    const existingStatuses = new Set(existingSystemRows.map((row) => row.status));
    const missing = SYSTEM_COLUMN_DEFAULTS.filter((column) => !existingStatuses.has(column.status));
    if (missing.length === 0) return;

    const nextPosition = await db
      .select({ value: max(issueBoardColumns.position) })
      .from(issueBoardColumns)
      .where(eq(issueBoardColumns.companyId, companyId))
      .then((rows) => Number(rows[0]?.value ?? -1) + 1);

    await db.insert(issueBoardColumns).values(missing.map((column, index) => ({
      companyId,
      ...column,
      position: nextPosition + index,
      isSystem: true,
      hidden: false,
    }))).onConflictDoNothing();
  }

  async function getTaskCount(row: ColumnRow) {
    const lanePredicate = row.isSystem
      ? and(eq(issues.status, row.status), sql`${issues.boardColumnId} is null`)
      : eq(issues.boardColumnId, row.id);
    return db
      .select({ count: sql<number>`count(*)::int` })
      .from(issues)
      .where(and(eq(issues.companyId, row.companyId), lanePredicate))
      .then((rows) => Number(rows[0]?.count ?? 0));
  }

  async function toView(row: ColumnRow): Promise<IssueBoardColumn> {
    return { ...row, taskCount: await getTaskCount(row) };
  }

  async function listRowsWithCounts(companyId: string): Promise<IssueBoardColumn[]> {
    const [rows, customCounts, systemCounts] = await Promise.all([
      db
        .select()
        .from(issueBoardColumns)
        .where(eq(issueBoardColumns.companyId, companyId))
        .orderBy(asc(issueBoardColumns.position), asc(issueBoardColumns.createdAt), asc(issueBoardColumns.id)),
      db
        .select({ columnId: issues.boardColumnId, count: sql<number>`count(*)::int` })
        .from(issues)
        .where(and(eq(issues.companyId, companyId), sql`${issues.boardColumnId} is not null`))
        .groupBy(issues.boardColumnId),
      db
        .select({ status: issues.status, count: sql<number>`count(*)::int` })
        .from(issues)
        .where(and(eq(issues.companyId, companyId), sql`${issues.boardColumnId} is null`))
        .groupBy(issues.status),
    ]);
    const customCountById = new Map(customCounts.map((row) => [row.columnId, Number(row.count ?? 0)]));
    const systemCountByStatus = new Map(systemCounts.map((row) => [row.status, Number(row.count ?? 0)]));
    return rows.map((row) => ({
      ...row,
      taskCount: row.isSystem
        ? systemCountByStatus.get(row.status) ?? 0
        : customCountById.get(row.id) ?? 0,
    }));
  }

  async function list(companyId: string): Promise<IssueBoardColumn[]> {
    const systemCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(issueBoardColumns)
      .where(and(eq(issueBoardColumns.companyId, companyId), eq(issueBoardColumns.isSystem, true)))
      .then((rows) => Number(rows[0]?.count ?? 0));
    if (systemCount < SYSTEM_COLUMN_DEFAULTS.length) {
      if (!mutationLockHeld) {
        return withCompanyLock(companyId, (lockedDb) => issueBoardColumnService(lockedDb, true).list(companyId));
      }
      await ensureSystemColumns(companyId);
    }
    return listRowsWithCounts(companyId);
  }

  async function create(companyId: string, input: CreateIssueBoardColumn): Promise<IssueBoardColumn> {
    if (!mutationLockHeld) {
      return withCompanyLock(companyId, (lockedDb) => issueBoardColumnService(lockedDb, true).create(companyId, input));
    }
    await ensureSystemColumns(companyId);
    const nextPosition = input.position ?? await db
      .select({ value: max(issueBoardColumns.position) })
      .from(issueBoardColumns)
      .where(eq(issueBoardColumns.companyId, companyId))
      .then((rows) => Number(rows[0]?.value ?? -1) + 1);
    try {
      const row = await db
        .insert(issueBoardColumns)
        .values({
          companyId,
          name: input.name.trim(),
          color: input.color,
          status: input.status,
          position: nextPosition,
          isSystem: false,
          hidden: false,
        })
        .returning()
        .then((rows) => rows[0]!);
      return { ...row, taskCount: 0 };
    } catch (error) {
      if (isPostgresError(error, "23505")) throw conflict("A custom board column with this name already exists");
      throw error;
    }
  }

  async function update(id: string, patch: UpdateIssueBoardColumn): Promise<IssueBoardColumn | null> {
    const existing = await getRow(id);
    if (!existing) return null;
    if (!mutationLockHeld) {
      return withCompanyLock(existing.companyId, (lockedDb) => issueBoardColumnService(lockedDb, true).update(id, patch));
    }
    if (existing.isSystem && patch.status && patch.status !== existing.status) {
      throw conflict("The internal status of a system column cannot be changed");
    }
    const taskCount = await getTaskCount(existing);
    if (!existing.isSystem && patch.status && patch.status !== existing.status && taskCount > 0) {
      throw conflict("Move all tasks out of this column before changing its system status");
    }
    try {
      const row = await db
        .update(issueBoardColumns)
        .set({
          ...(patch.name === undefined ? {} : { name: patch.name.trim() }),
          ...(patch.color === undefined ? {} : { color: patch.color }),
          ...(patch.status === undefined ? {} : { status: patch.status }),
          ...(patch.position === undefined ? {} : { position: patch.position }),
          updatedAt: new Date(),
        })
        .where(eq(issueBoardColumns.id, id))
        .returning()
        .then((rows) => rows[0] ?? null);
      return row ? { ...row, taskCount } : null;
    } catch (error) {
      if (isPostgresError(error, "23505")) throw conflict("A custom board column with this name already exists");
      throw error;
    }
  }

  async function reorder(companyId: string, input: ReorderIssueBoardColumns): Promise<IssueBoardColumn[]> {
    if (!mutationLockHeld) {
      return withCompanyLock(companyId, (lockedDb) => issueBoardColumnService(lockedDb, true).reorder(companyId, input));
    }
    await ensureSystemColumns(companyId);
    const rows = await db
      .select({ id: issueBoardColumns.id })
      .from(issueBoardColumns)
      .where(eq(issueBoardColumns.companyId, companyId));
    const existingIds = new Set(rows.map((row) => row.id));
    const requestedIds = new Set(input.columnIds);
    if (
      requestedIds.size !== input.columnIds.length
      || requestedIds.size !== existingIds.size
      || input.columnIds.some((id) => !existingIds.has(id))
    ) {
      throw conflict("Column order must include every board column exactly once");
    }
    for (const [position, id] of input.columnIds.entries()) {
      await db
        .update(issueBoardColumns)
        .set({ position, updatedAt: new Date() })
        .where(and(eq(issueBoardColumns.companyId, companyId), eq(issueBoardColumns.id, id)));
    }
    return listRowsWithCounts(companyId);
  }

  async function setVisibility(
    id: string,
    hidden: boolean,
    destinationColumnId: string | null,
  ): Promise<SetIssueBoardColumnVisibilityResult | null> {
    const existing = await getRow(id);
    if (!existing) return null;
    if (!mutationLockHeld) {
      return withCompanyLock(existing.companyId, (lockedDb) =>
        issueBoardColumnService(lockedDb, true).setVisibility(id, hidden, destinationColumnId));
    }
    if (!existing.isSystem) throw conflict("Only system columns can be hidden; custom columns can be deleted");
    if (existing.hidden === hidden) {
      return { column: await toView(existing), movedTaskCount: 0, destinationColumnId: null };
    }

    let movedTaskCount = 0;
    let destination: ColumnRow | null = null;
    if (hidden) {
      const visibleCount = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(issueBoardColumns)
        .where(and(eq(issueBoardColumns.companyId, existing.companyId), eq(issueBoardColumns.hidden, false)))
        .then((rows) => Number(rows[0]?.count ?? 0));
      if (visibleCount <= 1) throw conflict("At least one board column must remain visible");

      const taskCount = await getTaskCount(existing);
      if (taskCount > 0) {
        if (!destinationColumnId) {
          throw conflict("Choose a custom column with the same internal status before hiding this column");
        }
        destination = await getRow(destinationColumnId);
        if (!destination || destination.companyId !== existing.companyId || destination.hidden) {
          throw notFound("Destination column not found");
        }
        if (destination.isSystem || destination.status !== existing.status) {
          throw conflict("Tasks must be moved to a visible custom column with the same internal status");
        }
        const movedRows = await db
          .update(issues)
          .set({ boardColumnId: destination.id, updatedAt: new Date() })
          .where(and(
            eq(issues.companyId, existing.companyId),
            eq(issues.status, existing.status),
            sql`${issues.boardColumnId} is null`,
          ))
          .returning({ id: issues.id });
        movedTaskCount = movedRows.length;
      }
    }

    const updated = await db
      .update(issueBoardColumns)
      .set({ hidden, updatedAt: new Date() })
      .where(eq(issueBoardColumns.id, id))
      .returning()
      .then((rows) => rows[0]!);
    return {
      column: await toView(updated),
      movedTaskCount,
      destinationColumnId: destination?.id ?? null,
    };
  }

  async function deleteColumn(
    id: string,
    destinationColumnId: string | null,
  ): Promise<DeleteIssueBoardColumnResult | null> {
    const existing = await getRow(id);
    if (!existing) return null;
    if (!mutationLockHeld) {
      return withCompanyLock(existing.companyId, (lockedDb) =>
        issueBoardColumnService(lockedDb, true).deleteColumn(id, destinationColumnId));
    }
    if (existing.isSystem) throw conflict("System columns cannot be deleted; hide the column instead");
    await ensureSystemColumns(existing.companyId);

    const deletedView = await toView(existing);
    if (deletedView.taskCount === 0) {
      await db.delete(issueBoardColumns).where(eq(issueBoardColumns.id, id));
      return { deleted: deletedView, movedTaskCount: 0, destinationColumnId: null };
    }

    let destination: ColumnRow | null = null;
    if (destinationColumnId) {
      if (destinationColumnId === id) throw conflict("A column cannot be its own destination");
      destination = await getRow(destinationColumnId);
      if (!destination || destination.companyId !== existing.companyId || destination.hidden) {
        throw notFound("Destination column not found");
      }
      if (destination.status !== existing.status) {
        throw conflict("Tasks can only be moved to a column with the same internal status");
      }
    } else {
      destination = await db
        .select()
        .from(issueBoardColumns)
        .where(and(
          eq(issueBoardColumns.companyId, existing.companyId),
          eq(issueBoardColumns.status, existing.status),
          eq(issueBoardColumns.isSystem, true),
        ))
        .then((rows) => rows[0] ?? null);
      if (!destination || destination.hidden) {
        throw conflict("Choose a visible destination column before deleting this column");
      }
    }

    const movedRows = await db
      .update(issues)
      .set({ boardColumnId: destination.isSystem ? null : destination.id, updatedAt: new Date() })
      .where(and(eq(issues.companyId, existing.companyId), eq(issues.boardColumnId, id)))
      .returning({ id: issues.id });
    await db.delete(issueBoardColumns).where(eq(issueBoardColumns.id, id));
    return {
      deleted: deletedView,
      movedTaskCount: movedRows.length,
      destinationColumnId: destination.isSystem ? null : destination.id,
    };
  }

  return { list, getById: getRow, create, update, reorder, setVisibility, deleteColumn };
}
