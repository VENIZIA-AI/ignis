-- Hand-added: drizzle-kit emits the table and its policies, but never the schema that holds them
-- nor the grants the policies depend on. A policy is checked only AFTER the role clears table
-- privileges - without the GRANTs below, `authenticated` is refused before any policy is consulted,
-- and RLS would look like it "works" for the wrong reason.
CREATE SCHEMA IF NOT EXISTS "ignis_example";--> statement-breakpoint
CREATE TABLE "ignis_example"."note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
	"modified_at" timestamp with time zone DEFAULT NOW() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"is_private" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ignis_example"."note" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "IDX_note_owner_id" ON "ignis_example"."note" USING btree ("owner_id");--> statement-breakpoint
CREATE POLICY "note_select_own" ON "ignis_example"."note" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select auth.uid()) = "ignis_example"."note"."owner_id");--> statement-breakpoint
CREATE POLICY "note_insert_own" ON "ignis_example"."note" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select auth.uid()) = "ignis_example"."note"."owner_id");--> statement-breakpoint
CREATE POLICY "note_update_own" ON "ignis_example"."note" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((select auth.uid()) = "ignis_example"."note"."owner_id") WITH CHECK ((select auth.uid()) = "ignis_example"."note"."owner_id");--> statement-breakpoint
CREATE POLICY "note_delete_own" ON "ignis_example"."note" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((select auth.uid()) = "ignis_example"."note"."owner_id");--> statement-breakpoint
GRANT USAGE ON SCHEMA "ignis_example" TO "authenticated";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "ignis_example"."note" TO "authenticated";