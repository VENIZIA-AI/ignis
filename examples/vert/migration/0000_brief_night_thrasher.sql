CREATE TABLE "Configuration" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
	"modified_at" timestamp with time zone DEFAULT NOW() NOT NULL,
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
CREATE TABLE "MetaLink" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
	"modified_at" timestamp with time zone DEFAULT NOW() NOT NULL,
	"bucket_name" text NOT NULL,
	"object_name" text NOT NULL,
	"link" text NOT NULL,
	"mimetype" text NOT NULL,
	"size" integer NOT NULL,
	"etag" text,
	"metadata" jsonb,
	"storage_type" text NOT NULL,
	"is_synced" boolean DEFAULT false NOT NULL,
	"variant" text,
	"sequence" integer DEFAULT 0 NOT NULL,
	"principal_type" text,
	"principal_id" text
);
--> statement-breakpoint
CREATE TABLE "Organization" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
	"modified_at" timestamp with time zone DEFAULT NOW() NOT NULL,
	"identifier" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"parent_id" text,
	"status" text DEFAULT 'activated' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "Organization_identifier_unique" UNIQUE("identifier")
);
--> statement-breakpoint
CREATE TABLE "Permission" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
	"modified_at" timestamp with time zone DEFAULT NOW() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"method" text NOT NULL,
	"action" text NOT NULL,
	"scope" text NOT NULL,
	"description" text,
	"parent_id" text,
	CONSTRAINT "Permission_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "PolicyDefinition" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
	"modified_at" timestamp with time zone DEFAULT NOW() NOT NULL,
	"metadata" jsonb,
	"variant" text NOT NULL,
	"subject_type" text NOT NULL,
	"target_type" text NOT NULL,
	"domain_type" text,
	"action" text,
	"effect" text,
	"subject_id" text NOT NULL,
	"target_id" text NOT NULL,
	"domain_id" text
);
--> statement-breakpoint
CREATE TABLE "Product" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
	"modified_at" timestamp with time zone DEFAULT NOW() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" integer DEFAULT 0 NOT NULL,
	"tags" varchar(100)[],
	CONSTRAINT "UQ_Product_code" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "Role" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
	"modified_at" timestamp with time zone DEFAULT NOW() NOT NULL,
	"identifier" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"priority" integer NOT NULL,
	"status" text DEFAULT '201_ACTIVATED' NOT NULL,
	CONSTRAINT "Role_identifier_unique" UNIQUE("identifier")
);
--> statement-breakpoint
CREATE TABLE "SaleChannelProduct" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
	"modified_at" timestamp with time zone DEFAULT NOW() NOT NULL,
	"product_id" text NOT NULL,
	"sale_channel_id" text NOT NULL,
	CONSTRAINT "UQ_SaleChannelProduct_productId_saleChannelId" UNIQUE("product_id","sale_channel_id")
);
--> statement-breakpoint
CREATE TABLE "SaleChannel" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
	"modified_at" timestamp with time zone DEFAULT NOW() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "UQ_SaleChannel_code" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "User" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
	"modified_at" timestamp with time zone DEFAULT NOW() NOT NULL,
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
ALTER TABLE "Configuration" ADD CONSTRAINT "FK_Configuration_createdBy_User_id" FOREIGN KEY ("created_by") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "SaleChannelProduct" ADD CONSTRAINT "FK_SaleChannelProduct_productId_Product_id" FOREIGN KEY ("product_id") REFERENCES "public"."Product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "SaleChannelProduct" ADD CONSTRAINT "FK_SaleChannelProduct_saleChannelId_SaleChannel_id" FOREIGN KEY ("sale_channel_id") REFERENCES "public"."SaleChannel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_Configuration_group" ON "Configuration" USING btree ("group");--> statement-breakpoint
CREATE INDEX "IDX_MetaLink_bucketName" ON "MetaLink" USING btree ("bucket_name");--> statement-breakpoint
CREATE INDEX "IDX_MetaLink_objectName" ON "MetaLink" USING btree ("object_name");--> statement-breakpoint
CREATE INDEX "IDX_MetaLink_storageType" ON "MetaLink" USING btree ("storage_type");--> statement-breakpoint
CREATE INDEX "IDX_MetaLink_isSynced" ON "MetaLink" USING btree ("is_synced");--> statement-breakpoint
CREATE INDEX "IDX_MetaLink_principal_sequence" ON "MetaLink" USING btree ("principal_type","principal_id","sequence");--> statement-breakpoint
CREATE INDEX "IDX_Product_name" ON "Product" USING btree ("name");--> statement-breakpoint
CREATE INDEX "IDX_SaleChannelProduct_productId" ON "SaleChannelProduct" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "IDX_SaleChannelProduct_saleChannelId" ON "SaleChannelProduct" USING btree ("sale_channel_id");--> statement-breakpoint
CREATE INDEX "IDX_SaleChannel_name" ON "SaleChannel" USING btree ("name");--> statement-breakpoint
CREATE INDEX "IDX_SaleChannel_isActive" ON "SaleChannel" USING btree ("is_active");