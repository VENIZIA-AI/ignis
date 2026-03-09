CREATE TABLE "Configuration" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"modified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data_type" text,
	"n_value" double precision,
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
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"modified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"realm" text DEFAULT '',
	"status" text DEFAULT '000_UNKNOWN' NOT NULL,
	"type" text DEFAULT 'SYSTEM' NOT NULL,
	"activated_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"parent_id" text,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"password" text,
	"secret" text,
	CONSTRAINT "User_username_unique" UNIQUE("username"),
	CONSTRAINT "User_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "Product" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"modified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" integer DEFAULT 0 NOT NULL,
	"tags" varchar(100)[],
	CONSTRAINT "UQ_Product_code" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "SaleChannel" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"modified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "UQ_SaleChannel_code" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "SaleChannelProduct" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"modified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"product_id" text NOT NULL,
	"sale_channel_id" text NOT NULL,
	CONSTRAINT "UQ_SaleChannelProduct_productId_saleChannelId" UNIQUE("product_id","sale_channel_id")
);
--> statement-breakpoint
CREATE TABLE "Organization" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"modified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"identifier" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"parent_id" text,
	"status" text DEFAULT 'activated' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "Organization_identifier_unique" UNIQUE("identifier")
);
--> statement-breakpoint
CREATE TABLE "Role" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"modified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"identifier" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"priority" integer NOT NULL,
	"status" text DEFAULT '201_ACTIVATED' NOT NULL,
	CONSTRAINT "Role_identifier_unique" UNIQUE("identifier")
);
--> statement-breakpoint
CREATE TABLE "Permission" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"modified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"action" text NOT NULL,
	"scope" text NOT NULL,
	"parent_id" text,
	CONSTRAINT "Permission_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "PolicyDefinition" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"modified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"variant" text NOT NULL,
	"subject_type" text NOT NULL,
	"target_type" text NOT NULL,
	"action" text,
	"effect" text,
	"domain" text,
	"subject_id" text NOT NULL,
	"target_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Configuration" ADD CONSTRAINT "FK_Configuration_createdBy_User_id" FOREIGN KEY ("created_by") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "SaleChannelProduct" ADD CONSTRAINT "FK_SaleChannelProduct_productId_Product_id" FOREIGN KEY ("product_id") REFERENCES "public"."Product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "SaleChannelProduct" ADD CONSTRAINT "FK_SaleChannelProduct_saleChannelId_SaleChannel_id" FOREIGN KEY ("sale_channel_id") REFERENCES "public"."SaleChannel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_Configuration_group" ON "Configuration" USING btree ("group");--> statement-breakpoint
CREATE INDEX "IDX_Product_name" ON "Product" USING btree ("name");--> statement-breakpoint
CREATE INDEX "IDX_SaleChannel_name" ON "SaleChannel" USING btree ("name");--> statement-breakpoint
CREATE INDEX "IDX_SaleChannel_isActive" ON "SaleChannel" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "IDX_SaleChannelProduct_productId" ON "SaleChannelProduct" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "IDX_SaleChannelProduct_saleChannelId" ON "SaleChannelProduct" USING btree ("sale_channel_id");