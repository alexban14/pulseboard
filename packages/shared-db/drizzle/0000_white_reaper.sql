CREATE TABLE IF NOT EXISTS "tenants" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"plan" varchar(50) DEFAULT 'free' NOT NULL,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"branding" jsonb DEFAULT '{}'::jsonb,
	"custom_domain" varchar(255),
	"auth_config" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"deleted_at" timestamp with time zone,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_users" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(26) NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255),
	"role" varchar(50) DEFAULT 'viewer' NOT NULL,
	"auth_provider" varchar(50) DEFAULT 'local',
	"external_id" varchar(255),
	"password_hash" varchar(255),
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "uq_tenant_users_tenant_email" UNIQUE("tenant_id","email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "connector_instances" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(26) NOT NULL,
	"connector_type_id" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"config" text NOT NULL,
	"status" varchar(50) DEFAULT 'pending',
	"last_tested_at" timestamp with time zone,
	"last_test_error" text,
	"sync_schedule" varchar(100),
	"sync_mode" varchar(50) DEFAULT 'incremental',
	"last_sync_at" timestamp with time zone,
	"last_sync_rows" integer,
	"last_sync_duration_ms" integer,
	"next_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "uq_connector_instances_tenant_name" UNIQUE("tenant_id","name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "connector_sync_tables" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"connector_instance_id" varchar(26) NOT NULL,
	"source_table" varchar(255) NOT NULL,
	"warehouse_table" varchar(255) NOT NULL,
	"sync_enabled" boolean DEFAULT true,
	"incremental_column" varchar(255),
	"last_sync_value" text,
	CONSTRAINT "uq_sync_tables_instance_source" UNIQUE("connector_instance_id","source_table")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "connector_sync_runs" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"connector_instance_id" varchar(26) NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"status" varchar(50) NOT NULL,
	"rows_synced" integer DEFAULT 0,
	"tables_synced" integer DEFAULT 0,
	"error_message" text,
	"duration_ms" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dashboards" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(26) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false,
	"created_by" varchar(26),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "widgets" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"dashboard_id" varchar(26) NOT NULL,
	"type" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"position" jsonb NOT NULL,
	"query" jsonb NOT NULL,
	"display" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "semantic_models" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(26) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"version" integer DEFAULT 1,
	"status" varchar(50) DEFAULT 'draft',
	"created_by" varchar(26),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "uq_semantic_models_tenant_name" UNIQUE("tenant_id","name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stored_files" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(26) NOT NULL,
	"key" text NOT NULL,
	"original_name" varchar(500) NOT NULL,
	"content_type" varchar(255) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"storage_provider" varchar(50) NOT NULL,
	"purpose" varchar(50) NOT NULL,
	"connector_id" varchar(26),
	"uploaded_by" varchar(26),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "stored_files_key_unique" UNIQUE("key")
);
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "tenant_users" ADD CONSTRAINT "tenant_users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "connector_instances" ADD CONSTRAINT "connector_instances_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "connector_sync_tables" ADD CONSTRAINT "connector_sync_tables_connector_instance_id_connector_instances_id_fk" FOREIGN KEY ("connector_instance_id") REFERENCES "public"."connector_instances"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "connector_sync_runs" ADD CONSTRAINT "connector_sync_runs_connector_instance_id_connector_instances_id_fk" FOREIGN KEY ("connector_instance_id") REFERENCES "public"."connector_instances"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_created_by_tenant_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."tenant_users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "widgets" ADD CONSTRAINT "widgets_dashboard_id_dashboards_id_fk" FOREIGN KEY ("dashboard_id") REFERENCES "public"."dashboards"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "semantic_models" ADD CONSTRAINT "semantic_models_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "semantic_models" ADD CONSTRAINT "semantic_models_created_by_tenant_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."tenant_users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_connector_id_connector_instances_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."connector_instances"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_uploaded_by_tenant_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."tenant_users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tenants_slug" ON "tenants" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tenants_status" ON "tenants" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tenant_users_tenant_id" ON "tenant_users" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tenant_users_email" ON "tenant_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_connector_instances_tenant_id" ON "connector_instances" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_connector_instances_status" ON "connector_instances" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_connector_instances_next_sync" ON "connector_instances" USING btree ("next_sync_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sync_tables_connector_instance_id" ON "connector_sync_tables" USING btree ("connector_instance_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sync_runs_connector_instance_id" ON "connector_sync_runs" USING btree ("connector_instance_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sync_runs_status" ON "connector_sync_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sync_runs_started_at" ON "connector_sync_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_dashboards_tenant_id" ON "dashboards" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_dashboards_created_by" ON "dashboards" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_widgets_dashboard_id" ON "widgets" USING btree ("dashboard_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_semantic_models_tenant_id" ON "semantic_models" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_semantic_models_status" ON "semantic_models" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stored_files_tenant" ON "stored_files" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stored_files_connector" ON "stored_files" USING btree ("connector_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stored_files_purpose" ON "stored_files" USING btree ("purpose");