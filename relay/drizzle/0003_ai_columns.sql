ALTER TABLE "lead_settings" ADD COLUMN "ai_first_response" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ai" jsonb;