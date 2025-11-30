CREATE TABLE "Configuration" (
	"id" text PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"modified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data_type" text,
	"n_value" integer,
	"t_value" text,
	"b_value" "bytea",
	"j_value" jsonb,
	"bo_value" boolean,
	"created_by" text,
	"modified_by" text,
	"code" text NOT NULL,
	"description" text,
	"group" text NOT NULL,
	CONSTRAINT "UQ_Configuration_code" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "User" (
	"id" text PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"realm" text DEFAULT '',
	"status" text DEFAULT '000_UNKNOWN' NOT NULL,
	"type" text DEFAULT 'SYSTEM' NOT NULL,
	"activated_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"parent_id" text
);
--> statement-breakpoint
ALTER TABLE "Configuration" ADD CONSTRAINT "FK_Configuration_createdBy_User_id" FOREIGN KEY ("created_by") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_Configuration_group" ON "Configuration" USING btree ("group");