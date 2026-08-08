CREATE TABLE "calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"creator_user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendars_status_check" CHECK ("status" in ('active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "calendar_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"calendar_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_members_role_check" CHECK ("role" in ('creator', 'member')),
	CONSTRAINT "calendar_members_status_check" CHECK ("status" in ('active', 'left', 'removed'))
);
--> statement-breakpoint
CREATE TABLE "calendar_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"calendar_id" uuid NOT NULL,
	"invited_user_id" text,
	"invited_email" text NOT NULL,
	"invited_by_user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"calendar_id" uuid NOT NULL,
	"author_user_id" text NOT NULL,
	"title" text NOT NULL,
	"note" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"timezone" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"schedule_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_events_ends_after_starts_check" CHECK ("ends_at" is null or "ends_at" > "starts_at")
);
--> statement-breakpoint
CREATE TABLE "event_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"recipient_user_id" text NOT NULL,
	"schedule_version" integer NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_reminders_status_check" CHECK ("status" in ('pending', 'retry', 'sending', 'sent', 'cancelled', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "user_notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"event_reminders_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "calendar_members" ADD CONSTRAINT "calendar_members_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "calendar_members" ADD CONSTRAINT "calendar_members_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "calendar_invitations" ADD CONSTRAINT "calendar_invitations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "calendar_invitations" ADD CONSTRAINT "calendar_invitations_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "event_reminders" ADD CONSTRAINT "event_reminders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "event_reminders" ADD CONSTRAINT "event_reminders_event_id_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "calendars_company_status_idx" ON "calendars" USING btree ("company_id","status");
--> statement-breakpoint
CREATE INDEX "calendars_creator_idx" ON "calendars" USING btree ("company_id","creator_user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_members_calendar_user_unique_idx" ON "calendar_members" USING btree ("calendar_id","user_id");
--> statement-breakpoint
CREATE INDEX "calendar_members_user_company_status_idx" ON "calendar_members" USING btree ("user_id","company_id","status");
--> statement-breakpoint
CREATE INDEX "calendar_members_calendar_status_idx" ON "calendar_members" USING btree ("calendar_id","status");
--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_invitations_token_hash_unique_idx" ON "calendar_invitations" USING btree ("token_hash");
--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_invitations_calendar_user_pending_uq" ON "calendar_invitations" USING btree ("calendar_id","invited_user_id") WHERE invited_user_id is not null and accepted_at is null and revoked_at is null;
--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_invitations_calendar_email_pending_uq" ON "calendar_invitations" USING btree ("calendar_id","invited_email") WHERE accepted_at is null and revoked_at is null;
--> statement-breakpoint
CREATE INDEX "calendar_invitations_invited_user_idx" ON "calendar_invitations" USING btree ("invited_user_id","expires_at");
--> statement-breakpoint
CREATE INDEX "calendar_invitations_calendar_idx" ON "calendar_invitations" USING btree ("calendar_id","created_at");
--> statement-breakpoint
CREATE INDEX "calendar_events_calendar_range_idx" ON "calendar_events" USING btree ("calendar_id","starts_at");
--> statement-breakpoint
CREATE INDEX "calendar_events_company_range_idx" ON "calendar_events" USING btree ("company_id","starts_at");
--> statement-breakpoint
CREATE INDEX "calendar_events_calendar_ends_at_idx" ON "calendar_events" USING btree ("calendar_id","ends_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "event_reminders_event_recipient_version_unique_idx" ON "event_reminders" USING btree ("event_id","recipient_user_id","schedule_version");
--> statement-breakpoint
CREATE INDEX "event_reminders_pending_delivery_idx" ON "event_reminders" USING btree ("next_attempt_at") WHERE status in ('pending', 'retry');
--> statement-breakpoint
CREATE INDEX "event_reminders_event_status_idx" ON "event_reminders" USING btree ("event_id","status");
--> statement-breakpoint
CREATE UNIQUE INDEX "user_notification_preferences_user_uq" ON "user_notification_preferences" USING btree ("user_id");
