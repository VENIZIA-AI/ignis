CREATE TABLE "configurations" (
	"id" text PRIMARY KEY NOT NULL,
	"created_by" text,
	"modified_by" text,
	"code" text NOT NULL,
	"group" text NOT NULL,
	"description" text,
	CONSTRAINT "configurations_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
