import { and, asc, eq, max, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { issueBoardColumns, issues } from "@paperclipai/db";
import type {
  CreateIssueBoardColumn,
  DeleteIssueBoardColumnResult,
  IssueBoardColumn,
  ReorderIssueBoardColumns,
  UpdateIssueBoardColumn,
} from "@paperclipai/shared";
import { conflict, notFound } from "../errors.js";

type ColumnRow = typeof issueBoardColumns.$inferSelect;

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

  async function getTaskCount(companyId: string, columnId: string) {
    return db
      .select({ count: sql<number>`count(*)::int` })
      .from(issues)
      .where(and(eq(issues.companyId, companyId), eq(issues.boardColumnId, columnId)))
      .then((rows) => Number(rows[0]?.count ?? 0));
  }

  async function toView(row: ColumnRow): Promise<IssueBoardColumn> {
    return { ...row, taskCount: await getTaskCount(row.companyId, row.id) };
  }

  async function list(companyId: string): Promise<IssueBoardColumn[]> {
    const [rows, counts] = await Promise.all([
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
    ]);
    const countById = new Map(counts.map((row) => [row.columnId, Number(row.count ?? 0)]));
    return rows.map((row) => ({ ...row, taskCount: countById.get(row.id) ?? 0 }));
  }

  async function create(companyId: string, input: CreateIssueBoardColumn): Promise<IssueBoardColumn> {
    if (!mutationLockHeld) {
      return withCompanyLock(companyId, (lockedDb) => issueBoardColumnService(lockedDb, true).create(companyId, input));
    }
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
        })
        .returning()
        .then((rows) => rows[0]!);
      return { ...row, taskCount: 0 };
    } catch (error) {
      if (isPostgresError(error, "23505")) throw conflict("A board column with this name already exists");
      throw error;
    }
  }

  async function update(id: string, patch: UpdateIssueBoardColumn): Promise<IssueBoardColumn | null> {
    const existing = await getRow(id);
    if (!existing) return null;
    if (!mutationLockHeld) {
      return withCompanyLock(existing.companyId, (lockedDb) => issueBoardColumnService(lockedDb, true).update(id, patch));
    }
    const taskCount = await getTaskCount(existing.companyId, id);
    if (patch.status && patch.status !== existing.status && taskCount > 0) {
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
      if (isPostgresError(error, "23505")) throw conflict("A board column with this name already exists");
      throw error;
    }
  }

  async function reorder(companyId: string, input: ReorderIssueBoardColumns): Promise<IssueBoardColumn[]> {
    if (!mutationLockHeld) {
      return withCompanyLock(companyId, (lockedDb) => issueBoardColumnService(lockedDb, true).reorder(companyId, input));
    }
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
      throw conflict("Column order must include every custom board column exactly once");
    }
    for (const [position, id] of input.columnIds.entries()) {
      await db
        .update(issueBoardColumns)
        .set({ position, updatedAt: new Date() })
        .where(and(eq(issueBoardColumns.companyId, companyId), eq(issueBoardColumns.id, id)));
    }
    return list(companyId);
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
    let destination: ColumnRow | null = null;
    if (destinationColumnId) {
      if (destinationColumnId === id) throw conflict("A column cannot be its own destination");
      destination = await getRow(destinationColumnId);
      if (!destination || destination.companyId !== existing.companyId) throw notFound("Destination column not found");
      if (destination.status !== existing.status) {
        throw conflict("Tasks can only be moved to a column with the same system status");
      }
    }
    const deletedView = await toView(existing);
    const movedRows = await db
      .update(issues)
      .set({ boardColumnId: destination?.id ?? null, updatedAt: new Date() })
      .where(and(eq(issues.companyId, existing.companyId), eq(issues.boardColumnId, id)))
      .returning({ id: issues.id });
    await db.delete(issueBoardColumns).where(eq(issueBoardColumns.id, id));
    return {
      deleted: deletedView,
      movedTaskCount: movedRows.length,
      destinationColumnId: destination?.id ?? null,
    };
  }

  return { list, getById: getRow, create, update, reorder, deleteColumn };
}
