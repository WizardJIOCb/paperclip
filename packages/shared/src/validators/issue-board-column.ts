import { z } from "zod";
import { ISSUE_BOARD_COLUMN_COLORS, ISSUE_STATUSES } from "../constants.js";

export const createIssueBoardColumnSchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.enum(ISSUE_BOARD_COLUMN_COLORS).optional().default("gray"),
  status: z.enum(ISSUE_STATUSES),
  position: z.number().int().nonnegative().optional(),
}).strict();

export type CreateIssueBoardColumn = z.infer<typeof createIssueBoardColumnSchema>;

export const updateIssueBoardColumnSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  color: z.enum(ISSUE_BOARD_COLUMN_COLORS).optional(),
  status: z.enum(ISSUE_STATUSES).optional(),
  position: z.number().int().nonnegative().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: "At least one field is required",
});

export type UpdateIssueBoardColumn = z.infer<typeof updateIssueBoardColumnSchema>;

export const reorderIssueBoardColumnsSchema = z.object({
  columnIds: z.array(z.string().uuid()),
}).strict();

export type ReorderIssueBoardColumns = z.infer<typeof reorderIssueBoardColumnsSchema>;

export const deleteIssueBoardColumnSchema = z.object({
  destinationColumnId: z.string().uuid().nullable().optional().default(null),
}).strict();

export type DeleteIssueBoardColumn = z.infer<typeof deleteIssueBoardColumnSchema>;
