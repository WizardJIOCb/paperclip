CREATE TABLE "issue_board_columns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT 'gray' NOT NULL,
	"status" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "issue_board_columns" ADD CONSTRAINT "issue_board_columns_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "board_column_id" uuid;
--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_board_column_id_issue_board_columns_id_fk" FOREIGN KEY ("board_column_id") REFERENCES "public"."issue_board_columns"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "issue_board_columns_company_position_idx" ON "issue_board_columns" USING btree ("company_id","position");
--> statement-breakpoint
CREATE INDEX "issue_board_columns_company_status_idx" ON "issue_board_columns" USING btree ("company_id","status");
--> statement-breakpoint
CREATE UNIQUE INDEX "issue_board_columns_company_name_uq" ON "issue_board_columns" USING btree ("company_id",lower(btrim("name")));
--> statement-breakpoint
CREATE INDEX "issues_company_board_column_idx" ON "issues" USING btree ("company_id","board_column_id");
