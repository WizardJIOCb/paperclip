import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { companies, createDb, issueBoardColumns, issues } from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { issueBoardColumnService } from "../services/issue-board-columns.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

describeEmbeddedPostgres("issue board column service", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-issue-board-columns-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.delete(issues);
    await db.delete(issueBoardColumns);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seedCompany() {
    const companyId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
      defaultResponsibleUserId: "responsible-user",
    });
    return companyId;
  }

  it("creates, counts, reorders, and deletes columns without deleting tasks", async () => {
    const companyId = await seedCompany();
    const svc = issueBoardColumnService(db);
    const ready = await svc.create(companyId, { name: "Ready", status: "todo", color: "blue" });
    const qa = await svc.create(companyId, { name: "Ready for QA", status: "todo", color: "purple" });
    await db.insert(issues).values({ companyId, title: "Keep me", status: "todo", boardColumnId: ready.id });

    expect((await svc.list(companyId)).filter((column) => !column.isSystem)).toEqual([
      expect.objectContaining({ id: ready.id, taskCount: 1 }),
      expect.objectContaining({ id: qa.id, taskCount: 0 }),
    ]);

    const initialOrder = await svc.list(companyId);
    const reordered = await svc.reorder(companyId, {
      columnIds: initialOrder.map((column) => column.id === ready.id
        ? qa.id
        : column.id === qa.id ? ready.id : column.id),
    });
    expect(reordered.filter((column) => !column.isSystem).map((column) => column.id)).toEqual([qa.id, ready.id]);

    const moved = await svc.deleteColumn(ready.id, qa.id);
    expect(moved).toMatchObject({ movedTaskCount: 1, destinationColumnId: qa.id });
    const [issueAfterMove] = await db.select().from(issues);
    expect(issueAfterMove?.boardColumnId).toBe(qa.id);

    const returnedToSystem = await svc.deleteColumn(qa.id, null);
    expect(returnedToSystem).toMatchObject({ movedTaskCount: 1, destinationColumnId: null });
    const [issueAfterDelete] = await db.select().from(issues);
    expect(issueAfterDelete?.boardColumnId).toBeNull();
    expect(issueAfterDelete?.status).toBe("todo");
  });

  it("prevents changing or deleting a populated column across system statuses", async () => {
    const companyId = await seedCompany();
    const svc = issueBoardColumnService(db);
    const todo = await svc.create(companyId, { name: "Ready", status: "todo", color: "blue" });
    const blocked = await svc.create(companyId, { name: "Waiting", status: "blocked", color: "red" });
    await db.insert(issues).values({ companyId, title: "Keep me", status: "todo", boardColumnId: todo.id });

    await expect(svc.update(todo.id, { status: "blocked" })).rejects.toMatchObject({ status: 409 });
    await expect(svc.deleteColumn(todo.id, blocked.id)).rejects.toMatchObject({ status: 409 });
    expect(await db.select().from(issues).where(eq(issues.boardColumnId, todo.id))).toHaveLength(1);
  });

  it("customizes and safely hides system columns without changing internal statuses", async () => {
    const companyId = await seedCompany();
    const svc = issueBoardColumnService(db);
    const initialColumns = await svc.list(companyId);
    const blockedSystem = initialColumns.find((column) => column.isSystem && column.status === "blocked")!;
    const waiting = await svc.create(companyId, {
      name: "Waiting on client",
      status: "blocked",
      color: "yellow",
    });
    await db.insert(issues).values({ companyId, title: "Keep blocked", status: "blocked" });

    const renamed = await svc.update(blockedSystem.id, { name: "Needs attention", color: "purple" });
    expect(renamed).toMatchObject({
      name: "Needs attention",
      color: "purple",
      status: "blocked",
      isSystem: true,
      hidden: false,
      taskCount: 1,
    });
    await expect(svc.update(blockedSystem.id, { status: "todo" })).rejects.toMatchObject({ status: 409 });
    await expect(svc.setVisibility(blockedSystem.id, true, null)).rejects.toMatchObject({ status: 409 });

    const hidden = await svc.setVisibility(blockedSystem.id, true, waiting.id);
    expect(hidden).toMatchObject({
      movedTaskCount: 1,
      destinationColumnId: waiting.id,
      column: { hidden: true, taskCount: 0 },
    });
    const [issueAfterHide] = await db.select().from(issues);
    expect(issueAfterHide).toMatchObject({ status: "blocked", boardColumnId: waiting.id });

    const restored = await svc.setVisibility(blockedSystem.id, false, null);
    expect(restored).toMatchObject({ movedTaskCount: 0, column: { hidden: false } });
    await expect(svc.deleteColumn(blockedSystem.id, null)).rejects.toMatchObject({ status: 409 });
  });
});
