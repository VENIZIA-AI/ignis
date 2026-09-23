CREATE TABLE "comments" (
	"id" text PRIMARY KEY NOT NULL,
	"note_id" text NOT NULL,
	"text" varchar(2000) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;