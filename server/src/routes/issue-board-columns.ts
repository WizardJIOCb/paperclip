import { Router } from "express";
import type { Db } from "@paperclipai/db";
import {
  createIssueBoardColumnSchema,
  deleteIssueBoardColumnSchema,
  reorderIssueBoardColumnsSchema,
  setIssueBoardColumnVisibilitySchema,
  updateIssueBoardColumnSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { issueBoardColumnService, logActivity } from "../services/index.js";
import { assertBoard, assertCompanyAccess, getAccessibleResource, getActorInfo } from "./authz.js";

export function issueBoardColumnRoutes(db: Db) {
  const router = Router();
  const svc = issueBoardColumnService(db);

  router.get("/companies/:companyId/issue-board-columns", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json(await svc.list(companyId));
  });

  router.post(
    "/companies/:companyId/issue-board-columns",
    validate(createIssueBoardColumnSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      assertBoard(req);
      const created = await svc.create(companyId, req.body);
      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        agentApiKeyId: actor.agentApiKeyId,
        action: "issue_board_column.created",
        entityType: "issue_board_column",
        entityId: created.id,
        details: { name: created.name, color: created.color, status: created.status, position: created.position },
      });
      res.status(201).json(created);
    },
  );

  router.patch(
    "/issue-board-columns/:id",
    validate(updateIssueBoardColumnSchema),
    async (req, res) => {
      const id = req.params.id as string;
      const existing = await getAccessibleResource(req, res, svc.getById(id), "Board column not found");
      if (!existing) return;
      assertBoard(req);
      const updated = await svc.update(id, req.body);
      if (!updated) {
        res.status(404).json({ error: "Board column not found" });
        return;
      }
      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId: existing.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        agentApiKeyId: actor.agentApiKeyId,
        action: "issue_board_column.updated",
        entityType: "issue_board_column",
        entityId: updated.id,
        details: { name: updated.name, color: updated.color, status: updated.status, position: updated.position },
      });
      res.json(updated);
    },
  );

  router.put(
    "/companies/:companyId/issue-board-columns/order",
    validate(reorderIssueBoardColumnsSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      assertBoard(req);
      const columns = await svc.reorder(companyId, req.body);
      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        agentApiKeyId: actor.agentApiKeyId,
        action: "issue_board_column.reordered",
        entityType: "company",
        entityId: companyId,
        details: { columnIds: req.body.columnIds },
      });
      res.json(columns);
    },
  );

  router.put(
    "/issue-board-columns/:id/visibility",
    validate(setIssueBoardColumnVisibilitySchema),
    async (req, res) => {
      const id = req.params.id as string;
      const existing = await getAccessibleResource(req, res, svc.getById(id), "Board column not found");
      if (!existing) return;
      assertBoard(req);
      const result = await svc.setVisibility(id, req.body.hidden, req.body.destinationColumnId ?? null);
      if (!result) {
        res.status(404).json({ error: "Board column not found" });
        return;
      }
      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId: existing.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        agentApiKeyId: actor.agentApiKeyId,
        action: result.column.hidden ? "issue_board_column.hidden" : "issue_board_column.restored",
        entityType: "issue_board_column",
        entityId: id,
        details: {
          name: result.column.name,
          status: result.column.status,
          movedTaskCount: result.movedTaskCount,
          destinationColumnId: result.destinationColumnId,
        },
      });
      res.json(result);
    },
  );

  router.delete(
    "/issue-board-columns/:id",
    validate(deleteIssueBoardColumnSchema),
    async (req, res) => {
      const id = req.params.id as string;
      const existing = await getAccessibleResource(req, res, svc.getById(id), "Board column not found");
      if (!existing) return;
      assertBoard(req);
      const result = await svc.deleteColumn(id, req.body.destinationColumnId ?? null);
      if (!result) {
        res.status(404).json({ error: "Board column not found" });
        return;
      }
      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId: existing.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        agentApiKeyId: actor.agentApiKeyId,
        action: "issue_board_column.deleted",
        entityType: "issue_board_column",
        entityId: id,
        details: {
          name: result.deleted.name,
          movedTaskCount: result.movedTaskCount,
          destinationColumnId: result.destinationColumnId,
        },
      });
      res.json(result);
    },
  );

  return router;
}
