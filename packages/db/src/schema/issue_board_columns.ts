import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { IssueBoardColumnColor, IssueStatus } from "@paperclipai/shared";
import { companies } from "./companies.js";

export const issueBoardColumns = pgTable(
  "issue_board_columns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").$type<IssueBoardColumnColor>().notNull().default("gray"),
    status: text("status").$type<IssueStatus>().notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyPositionIdx: index("issue_board_columns_company_position_idx").on(table.companyId, table.position),
    companyStatusIdx: index("issue_board_columns_company_status_idx").on(table.companyId, table.status),
    companyNameIdx: uniqueIndex("issue_board_columns_company_name_uq").on(
      table.companyId,
      sql`lower(btrim(${table.name}))`,
    ),
  }),
);
