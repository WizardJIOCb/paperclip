ALTER TABLE "issue_board_columns" ADD COLUMN "is_system" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "issue_board_columns" ADD COLUMN "hidden" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
DROP INDEX "issue_board_columns_company_name_uq";
--> statement-breakpoint
CREATE UNIQUE INDEX "issue_board_columns_company_custom_name_uq" ON "issue_board_columns" USING btree ("company_id",lower(btrim("name"))) WHERE "is_system" = false;
--> statement-breakpoint
CREATE UNIQUE INDEX "issue_board_columns_company_system_status_uq" ON "issue_board_columns" USING btree ("company_id","status") WHERE "is_system" = true;
--> statement-breakpoint
WITH ordered_custom_columns AS (
	SELECT
		"id",
		CASE "status"
			WHEN 'backlog' THEN 0
			WHEN 'todo' THEN 1000000
			WHEN 'in_progress' THEN 2000000
			WHEN 'in_review' THEN 3000000
			WHEN 'blocked' THEN 4000000
			WHEN 'done' THEN 5000000
			WHEN 'cancelled' THEN 6000000
		END + row_number() OVER (
			PARTITION BY "company_id", "status"
			ORDER BY "position", "created_at", "id"
		)::integer AS "next_position"
	FROM "issue_board_columns"
	WHERE "is_system" = false
)
UPDATE "issue_board_columns"
SET "position" = ordered_custom_columns."next_position"
FROM ordered_custom_columns
WHERE "issue_board_columns"."id" = ordered_custom_columns."id";
--> statement-breakpoint
INSERT INTO "issue_board_columns" ("company_id", "name", "color", "status", "position", "is_system", "hidden")
SELECT
	companies."id",
	defaults."name",
	defaults."color",
	defaults."status",
	defaults."position",
	true,
	false
FROM "companies"
CROSS JOIN (VALUES
	('Backlog', 'gray', 'backlog', 0),
	('Todo', 'yellow', 'todo', 1000000),
	('In progress', 'blue', 'in_progress', 2000000),
	('In review', 'purple', 'in_review', 3000000),
	('Blocked', 'red', 'blocked', 4000000),
	('Done', 'green', 'done', 5000000),
	('Cancelled', 'gray', 'cancelled', 6000000)
) AS defaults("name", "color", "status", "position");
