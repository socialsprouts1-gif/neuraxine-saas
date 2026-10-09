// GENERATED FILE — do not edit.
//
// Written by scripts/build-setup-sql.mjs from supabase/migrations/*.sql.
// Regenerate with: node scripts/build-setup-sql.mjs

export interface SchemaTable {
  /** The table name, without the public. prefix. */
  table: string;
  /** The migration file that creates it. */
  migration: string;
  /** The monthly bundle under supabase/updates/ that contains it. */
  bundle: string;
}

export const SCHEMA_MANIFEST: SchemaTable[] = [
  { table: "organizations", migration: "20260818120000_schema.sql", bundle: "2026-08" },
  { table: "org_members", migration: "20260818120000_schema.sql", bundle: "2026-08" },
  { table: "waba_connections", migration: "20260818120000_schema.sql", bundle: "2026-08" },
  { table: "contacts", migration: "20260818120000_schema.sql", bundle: "2026-08" },
  { table: "conversations", migration: "20260818120000_schema.sql", bundle: "2026-08" },
  { table: "messages", migration: "20260818120000_schema.sql", bundle: "2026-08" },
  { table: "message_templates", migration: "20260818120000_schema.sql", bundle: "2026-08" },
  { table: "campaigns", migration: "20260818120000_schema.sql", bundle: "2026-08" },
  { table: "campaign_recipients", migration: "20260818120000_schema.sql", bundle: "2026-08" },
  { table: "automation_flows", migration: "20260818120000_schema.sql", bundle: "2026-08" },
  { table: "platform_admins", migration: "20260820100000_admin_billing.sql", bundle: "2026-08" },
  { table: "plans", migration: "20260820100000_admin_billing.sql", bundle: "2026-08" },
  { table: "add_ons", migration: "20260820100000_admin_billing.sql", bundle: "2026-08" },
  { table: "subscriptions", migration: "20260820100000_admin_billing.sql", bundle: "2026-08" },
  { table: "org_add_ons", migration: "20260820100000_admin_billing.sql", bundle: "2026-08" },
  { table: "coupons", migration: "20260820100000_admin_billing.sql", bundle: "2026-08" },
  { table: "orders", migration: "20260820100000_admin_billing.sql", bundle: "2026-08" },
  { table: "support_tickets", migration: "20260820100000_admin_billing.sql", bundle: "2026-08" },
  { table: "support_ticket_messages", migration: "20260820100000_admin_billing.sql", bundle: "2026-08" },
  { table: "webhook_logs", migration: "20260820100000_admin_billing.sql", bundle: "2026-08" },
  { table: "platform_settings", migration: "20260820100000_admin_billing.sql", bundle: "2026-08" },
  { table: "ai_assistants", migration: "20260820180000_portal_modules.sql", bundle: "2026-08" },
  { table: "chatbot_flows", migration: "20260820180000_portal_modules.sql", bundle: "2026-08" },
  { table: "faq_entries", migration: "20260820180000_portal_modules.sql", bundle: "2026-08" },
  { table: "reminders", migration: "20260820180000_portal_modules.sql", bundle: "2026-08" },
  { table: "org_integrations", migration: "20260820180000_portal_modules.sql", bundle: "2026-08" },
  { table: "api_keys", migration: "20260820180000_portal_modules.sql", bundle: "2026-08" },
  { table: "outgoing_webhooks", migration: "20260820180000_portal_modules.sql", bundle: "2026-08" },
  { table: "webhook_deliveries", migration: "20260820180000_portal_modules.sql", bundle: "2026-08" },
  { table: "media_assets", migration: "20260820180000_portal_modules.sql", bundle: "2026-08" },
  { table: "products", migration: "20260820180000_portal_modules.sql", bundle: "2026-08" },
  { table: "bot_runs", migration: "20260821100000_message_runner.sql", bundle: "2026-08" },
  { table: "canned_messages", migration: "20260822140000_manage_workspace.sql", bundle: "2026-08" },
  { table: "contact_groups", migration: "20260822140000_manage_workspace.sql", bundle: "2026-08" },
  { table: "contact_group_members", migration: "20260822140000_manage_workspace.sql", bundle: "2026-08" },
  { table: "contact_columns", migration: "20260822140000_manage_workspace.sql", bundle: "2026-08" },
  { table: "assistant_knowledge", migration: "20260827090000_assistant_providers.sql", bundle: "2026-08" },
  { table: "profiles", migration: "20260828090000_inbox.sql", bundle: "2026-08" },
  { table: "conversation_notes", migration: "20260829090000_inbox_crm.sql", bundle: "2026-08" },
  { table: "conversation_events", migration: "20260829090000_inbox_crm.sql", bundle: "2026-08" },
  { table: "meetings", migration: "20260902090000_leads_meetings_transactions.sql", bundle: "2026-09" },
  { table: "transactions", migration: "20260902090000_leads_meetings_transactions.sql", bundle: "2026-09" },
  { table: "campaign_steps", migration: "20260903090000_templates_campaigns.sql", bundle: "2026-09" },
  { table: "whatsapp_flows", migration: "20260904090000_whatsapp_flows.sql", bundle: "2026-09" },
  { table: "flow_sends", migration: "20260904090000_whatsapp_flows.sql", bundle: "2026-09" },
  { table: "flow_responses", migration: "20260904090000_whatsapp_flows.sql", bundle: "2026-09" },
  { table: "site_content", migration: "20260907090000_site_content.sql", bundle: "2026-09" },
  { table: "crm_sync_log", migration: "20260910090000_crm_sync.sql", bundle: "2026-09" },
  { table: "appointment_types", migration: "20260911090000_appointments.sql", bundle: "2026-09" },
  { table: "appointment_settings", migration: "20260911090000_appointments.sql", bundle: "2026-09" },
  { table: "appointment_blackouts", migration: "20260911090000_appointments.sql", bundle: "2026-09" },
  { table: "booking_sessions", migration: "20260911090000_appointments.sql", bundle: "2026-09" },
  { table: "store_orders", migration: "20260913090000_commerce_orders.sql", bundle: "2026-09" },
  { table: "store_order_items", migration: "20260913090000_commerce_orders.sql", bundle: "2026-09" },
  { table: "payment_settings", migration: "20260913090000_commerce_orders.sql", bundle: "2026-09" },
  { table: "invoice_settings", migration: "20260914090000_invoicing.sql", bundle: "2026-09" },
  { table: "recurring_invoices", migration: "20260914090000_invoicing.sql", bundle: "2026-09" },
  { table: "invoices", migration: "20260914090000_invoicing.sql", bundle: "2026-09" },
  { table: "invoice_items", migration: "20260914090000_invoicing.sql", bundle: "2026-09" },
  { table: "org_invites", migration: "20260918090000_invites_checkout.sql", bundle: "2026-09" },
];
