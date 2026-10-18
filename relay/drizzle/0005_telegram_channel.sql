ALTER TYPE "public"."lead_source" ADD VALUE 'telegram';--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "telegram_chat_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_ws_tg" ON "contacts" USING btree ("workspace_id","telegram_chat_id");