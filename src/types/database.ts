// Hand-written to match supabase/migrations/*.sql. Regenerate with
// `supabase gen types typescript` once a live project exists, and reconcile
// any drift against these migrations.
//
// Every table includes `Relationships: []` and the schema includes empty
// `Views`/`Functions` because @supabase/supabase-js's client generic only
// resolves table types when the schema structurally satisfies its
// GenericSchema constraint — omitting these makes every `.from(...)` call
// silently type as `never` instead of erroring.

import type {
  AddOn,
  Coupon,
  Order,
  Plan,
  PlatformSetting,
  Subscription,
  SupportTicket,
  WebhookLog,
} from "./admin";
import type {
  AiAssistant,
  AssistantKnowledge,
  Profile,
  ConversationNote,
  CampaignStep,
  WhatsappFlow,
  FlowSend,
  FlowResponse,
  Meeting,
  Transaction,
  ConversationEvent,
  ApiKey,
  BotRun,
  CannedMessage,
  ContactColumn,
  ContactGroup,
  ContactGroupMember,
  ChatbotFlow,
  FaqEntry,
  MediaAsset,
  OrgIntegration,
  OutgoingWebhook,
  Product,
  Reminder,
  WebhookDelivery,
} from "./portal";

export type OrgRole = "owner" | "admin" | "member";
export type WabaStatus = "pending" | "active" | "disabled" | "error";
export type ConversationStatus = "open" | "pending" | "resolved" | "closed";
export type MessageDirection = "inbound" | "outbound";
export type MessageStatus = "sent" | "delivered" | "read" | "failed";
export type TemplateCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION";
// Meta reports paused and in_appeal too, and the column allows them.
export type TemplateStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "disabled"
  | "paused"
  | "in_appeal";
export type CampaignStatus = "draft" | "scheduled" | "running" | "completed" | "cancelled" | "failed";
export type CampaignRecipientStatus = "pending" | "sent" | "delivered" | "read" | "failed";

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: { id: string; name: string; created_at: string };
        Insert: { id?: string; name: string; created_at?: string };
        Update: { id?: string; name?: string; created_at?: string };
        Relationships: [];
      };
      org_members: {
        Row: { org_id: string; user_id: string; role: OrgRole; created_at: string };
        Insert: { org_id: string; user_id: string; role?: OrgRole; created_at?: string };
        Update: { org_id?: string; user_id?: string; role?: OrgRole; created_at?: string };
        // Relationships are not documentation — postgrest-js reads them to
        // resolve embedded selects like `organizations(name)`. An empty
        // array makes any such query resolve to `never`.
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      waba_connections: {
        Row: {
          id: string;
          org_id: string;
          waba_id: string;
          phone_number_id: string;
          meta_app_id: string;
          access_token_encrypted: string;
          webhook_verify_token: string;
          status: WabaStatus;
          display_phone_number: string | null;
          verified_name: string | null;
          quality_rating: string | null;
          label: string | null;
          is_default: boolean;
          last_checked_at: string | null;
          last_error: string | null;
          last_error_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          waba_id: string;
          phone_number_id: string;
          meta_app_id: string;
          access_token_encrypted: string;
          webhook_verify_token: string;
          status?: WabaStatus;
          display_phone_number?: string | null;
          verified_name?: string | null;
          quality_rating?: string | null;
          label?: string | null;
          is_default?: boolean;
          last_checked_at?: string | null;
          last_error?: string | null;
          last_error_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["waba_connections"]["Insert"]>;
        Relationships: [];
      };
      contacts: {
        Row: {
          id: string;
          org_id: string;
          wa_id: string;
          name: string | null;
          tags: string[];
          custom_fields: Record<string, string>;
          opted_out: boolean;
          opted_out_at: string | null;
          opt_out_reason: string | null;
          lead_stage: import("./portal").LeadStage;
          lead_score: number | null;
          lead_score_reasons: string[];
          source: string | null;
          campaign: string | null;
          deal_value: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          wa_id: string;
          name?: string | null;
          tags?: string[];
          custom_fields?: Record<string, string>;
          opted_out?: boolean;
          opted_out_at?: string | null;
          opt_out_reason?: string | null;
          lead_stage?: import("./portal").LeadStage;
          lead_score?: number | null;
          lead_score_reasons?: string[];
          source?: string | null;
          campaign?: string | null;
          deal_value?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["contacts"]["Insert"]>;
        Relationships: [];
      };
      conversations: {
        Row: {
          id: string;
          org_id: string;
          contact_id: string;
          connection_id: string | null;
          last_message_at: string | null;
          status: ConversationStatus;
          created_at: string;
          bot_enabled: boolean;
          bot_flow_id: string | null;
          bot_node_id: string | null;
          last_inbound_at: string | null;
          bot_variables: Record<string, string>;
          bot_resume_at: string | null;
          bot_resume_node_id: string | null;
          assigned_to: string | null;
          last_read_at: string | null;
          ai_mode: "ai" | "copilot" | "human";
          priority: "normal" | "medium" | "high" | "urgent";
          closed_at: string | null;
          needs_human: boolean;
          needs_human_reason: string | null;
          ai_summary: string | null;
          ai_next_action: string | null;
          ai_intent: string | null;
          ai_sentiment: string | null;
          ai_analyzed_at: string | null;
          ai_analyzed_message_id: string | null;
        };
        Insert: {
          id?: string;
          org_id: string;
          contact_id: string;
          connection_id?: string | null;
          last_message_at?: string | null;
          status?: ConversationStatus;
          created_at?: string;
          bot_enabled?: boolean;
          bot_flow_id?: string | null;
          bot_node_id?: string | null;
          last_inbound_at?: string | null;
          bot_variables?: Record<string, string>;
          bot_resume_at?: string | null;
          bot_resume_node_id?: string | null;
          assigned_to?: string | null;
          last_read_at?: string | null;
          ai_mode?: "ai" | "copilot" | "human";
          priority?: "normal" | "medium" | "high" | "urgent";
          closed_at?: string | null;
          needs_human?: boolean;
          needs_human_reason?: string | null;
          ai_summary?: string | null;
          ai_next_action?: string | null;
          ai_intent?: string | null;
          ai_sentiment?: string | null;
          ai_analyzed_at?: string | null;
          ai_analyzed_message_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["conversations"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "conversations_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          org_id: string;
          direction: MessageDirection;
          type: string;
          content: Record<string, unknown>;
          wa_message_id: string | null;
          status: MessageStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          org_id?: string;
          direction: MessageDirection;
          type: string;
          content?: Record<string, unknown>;
          wa_message_id?: string | null;
          status?: MessageStatus;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["messages"]["Insert"]>;
        Relationships: [];
      };
      message_templates: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          category: TemplateCategory;
          status: TemplateStatus;
          language: string;
          components_json: unknown[];
          waba_id: string;
          waba_template_id: string | null;
          rejected_reason: string | null;
          last_synced_at: string | null;
          header_format: "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
          header_text: string;
          header_media_url: string;
          body_text: string;
          footer_text: string;
          buttons: unknown[];
          variable_samples: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          category?: TemplateCategory;
          status?: TemplateStatus;
          language?: string;
          components_json?: unknown[];
          waba_id?: string;
          waba_template_id?: string | null;
          rejected_reason?: string | null;
          last_synced_at?: string | null;
          header_format?: "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
          header_text?: string;
          header_media_url?: string;
          body_text?: string;
          footer_text?: string;
          buttons?: unknown[];
          variable_samples?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["message_templates"]["Insert"]>;
        Relationships: [];
      };
      campaigns: {
        Row: {
          id: string;
          org_id: string;
          connection_id: string | null;
          template_id: string | null;
          segment_filter: Record<string, unknown>;
          status: CampaignStatus;
          scheduled_at: string | null;
          created_at: string;
          name: string;
          variables: string[];
          audience: Record<string, unknown>;
          started_at: string | null;
          completed_at: string | null;
          last_error: string | null;
          is_drip: boolean;
        };
        Insert: {
          id?: string;
          org_id: string;
          template_id?: string | null;
          segment_filter?: Record<string, unknown>;
          status?: CampaignStatus;
          scheduled_at?: string | null;
          created_at?: string;
          name?: string;
          variables?: string[];
          audience?: Record<string, unknown>;
          started_at?: string | null;
          completed_at?: string | null;
          last_error?: string | null;
          is_drip?: boolean;
          connection_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["campaigns"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "campaigns_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "message_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      campaign_recipients: {
        Row: {
          id: string;
          campaign_id: string;
          org_id: string;
          contact_id: string | null;
          status: CampaignRecipientStatus;
          sent_at: string | null;
          created_at: string;
          wa_id: string | null;
          wa_message_id: string | null;
          error: string | null;
          step_index: number;
          send_after: string | null;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          org_id?: string;
          contact_id?: string | null;
          status?: CampaignRecipientStatus;
          sent_at?: string | null;
          created_at?: string;
          wa_id?: string | null;
          wa_message_id?: string | null;
          error?: string | null;
          step_index?: number;
          send_after?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["campaign_recipients"]["Insert"]>;
        Relationships: [];
      };
      automation_flows: {
        Row: {
          id: string;
          org_id: string;
          connection_id: string | null;
          name: string;
          trigger_type: string;
          trigger_config: Record<string, unknown>;
          actions_json: unknown[];
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          trigger_type: string;
          trigger_config?: Record<string, unknown>;
          actions_json?: unknown[];
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["automation_flows"]["Insert"]>;
        Relationships: [];
      };

      // --- platform administration + billing -----------------------------
      platform_admins: {
        Row: { user_id: string; created_at: string };
        Insert: { user_id: string; created_at?: string };
        Update: { user_id?: string; created_at?: string };
        Relationships: [];
      };
      plans: {
        Row: Plan;
        Insert: Partial<Plan> & { name: string; slug: string };
        Update: Partial<Plan>;
        Relationships: [];
      };
      add_ons: {
        Row: AddOn;
        Insert: Partial<AddOn> & { name: string; slug: string };
        Update: Partial<AddOn>;
        Relationships: [];
      };
      subscriptions: {
        Row: Subscription;
        Insert: Partial<Subscription> & { org_id: string };
        Update: Partial<Subscription>;
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscriptions_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      org_add_ons: {
        Row: {
          id: string;
          org_id: string;
          add_on_id: string;
          quantity: number;
          created_at: string;
        };
        Insert: { id?: string; org_id: string; add_on_id: string; quantity?: number; created_at?: string };
        Update: Partial<{ org_id: string; add_on_id: string; quantity: number }>;
        Relationships: [];
      };
      coupons: {
        Row: Coupon;
        Insert: Partial<Coupon> & { code: string; discount_value: number };
        Update: Partial<Coupon>;
        Relationships: [];
      };
      orders: {
        Row: Order;
        Insert: Partial<Order> & { org_id: string };
        Update: Partial<Order>;
        Relationships: [
          {
            foreignKeyName: "orders_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
        ];
      };
      support_tickets: {
        Row: SupportTicket;
        Insert: Partial<SupportTicket> & { org_id: string; subject: string; body: string };
        Update: Partial<SupportTicket>;
        Relationships: [
          {
            foreignKeyName: "support_tickets_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      support_ticket_messages: {
        Row: {
          id: string;
          ticket_id: string;
          org_id: string;
          author_id: string | null;
          body: string;
          is_staff: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          ticket_id: string;
          org_id?: string;
          author_id?: string | null;
          body: string;
          is_staff?: boolean;
          created_at?: string;
        };
        Update: Partial<{ body: string; is_staff: boolean }>;
        Relationships: [];
      };
      webhook_logs: {
        Row: WebhookLog;
        Insert: Partial<WebhookLog>;
        Update: Partial<WebhookLog>;
        Relationships: [
          {
            foreignKeyName: "webhook_logs_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_settings: {
        Row: PlatformSetting;
        Insert: Partial<PlatformSetting> & { key: string };
        Update: Partial<PlatformSetting>;
        Relationships: [];
      };

      // --- portal modules -------------------------------------------------
      ai_assistants: {
        Row: AiAssistant;
        Insert: Partial<AiAssistant> & { org_id: string; name: string };
        Update: Partial<AiAssistant>;
        Relationships: [];
      };
      campaign_steps: {
        Row: CampaignStep;
        Insert: Partial<CampaignStep> & {
          org_id: string;
          campaign_id: string;
          step_index: number;
        };
        Update: Partial<CampaignStep>;
        Relationships: [];
      };
      meetings: {
        Row: Meeting;
        Insert: Partial<Meeting> & { org_id: string; title: string; starts_at: string };
        Update: Partial<Meeting>;
        Relationships: [
          {
            foreignKeyName: "meetings_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
      transactions: {
        Row: Transaction;
        Insert: Partial<Transaction> & { org_id: string };
        Update: Partial<Transaction>;
        Relationships: [
          {
            foreignKeyName: "transactions_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
      conversation_notes: {
        Row: ConversationNote;
        Insert: Partial<ConversationNote> & {
          org_id: string;
          conversation_id: string;
          body: string;
        };
        Update: Partial<ConversationNote>;
        Relationships: [];
      };
      conversation_events: {
        Row: ConversationEvent;
        Insert: Partial<ConversationEvent> & {
          org_id: string;
          conversation_id: string;
          kind: string;
          label: string;
        };
        Update: Partial<ConversationEvent>;
        Relationships: [];
      };
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { user_id: string };
        Update: Partial<Profile>;
        Relationships: [];
      };
      assistant_knowledge: {
        Row: AssistantKnowledge;
        Insert: Partial<AssistantKnowledge> & { org_id: string; title: string };
        Update: Partial<AssistantKnowledge>;
        Relationships: [
          {
            foreignKeyName: "assistant_knowledge_assistant_id_fkey";
            columns: ["assistant_id"];
            isOneToOne: false;
            referencedRelation: "ai_assistants";
            referencedColumns: ["id"];
          },
        ];
      };
      chatbot_flows: {
        Row: ChatbotFlow;
        Insert: Partial<ChatbotFlow> & { org_id: string; name: string };
        Update: Partial<ChatbotFlow>;
        Relationships: [];
      };
      faq_entries: {
        Row: FaqEntry;
        Insert: Partial<FaqEntry> & { org_id: string; question: string; answer: string };
        Update: Partial<FaqEntry>;
        Relationships: [];
      };
      reminders: {
        Row: Reminder;
        Insert: Partial<Reminder> & { org_id: string; title: string; remind_at: string };
        Update: Partial<Reminder>;
        Relationships: [
          {
            foreignKeyName: "reminders_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
      org_integrations: {
        Row: OrgIntegration;
        Insert: Partial<OrgIntegration> & { org_id: string; provider: string };
        Update: Partial<OrgIntegration>;
        Relationships: [];
      };
      api_keys: {
        Row: ApiKey;
        Insert: Partial<ApiKey> & {
          org_id: string;
          name: string;
          key_prefix: string;
          key_hash: string;
        };
        Update: Partial<ApiKey>;
        Relationships: [];
      };
      outgoing_webhooks: {
        Row: OutgoingWebhook;
        Insert: Partial<OutgoingWebhook> & {
          org_id: string;
          name: string;
          target_url: string;
          secret: string;
        };
        Update: Partial<OutgoingWebhook>;
        Relationships: [];
      };
      webhook_deliveries: {
        Row: WebhookDelivery;
        Insert: Partial<WebhookDelivery> & { webhook_id: string; org_id: string; event: string };
        Update: Partial<WebhookDelivery>;
        Relationships: [];
      };
      media_assets: {
        Row: MediaAsset;
        Insert: Partial<MediaAsset> & { org_id: string; name: string; url: string };
        Update: Partial<MediaAsset>;
        Relationships: [];
      };
      products: {
        Row: Product;
        Insert: Partial<Product> & { org_id: string; name: string };
        Update: Partial<Product>;
        Relationships: [];
      };
      canned_messages: {
        Row: CannedMessage;
        Insert: Partial<CannedMessage> & { org_id: string; shortcut: string; title: string; body: string };
        Update: Partial<CannedMessage>;
        Relationships: [];
      };
      whatsapp_flows: {
        Row: WhatsappFlow;
        Insert: Partial<WhatsappFlow> & { org_id: string; name: string };
        Update: Partial<WhatsappFlow>;
        Relationships: [];
      };
      flow_sends: {
        Row: FlowSend;
        Insert: Partial<FlowSend> & { org_id: string; flow_id: string; wa_id: string; flow_token: string };
        Update: Partial<FlowSend>;
        Relationships: [];
      };
      flow_responses: {
        Row: FlowResponse;
        Insert: Partial<FlowResponse> & { org_id: string };
        Update: Partial<FlowResponse>;
        Relationships: [];
      };
      contact_groups: {
        Row: ContactGroup;
        Insert: Partial<ContactGroup> & { org_id: string; name: string };
        Update: Partial<ContactGroup>;
        Relationships: [];
      };
      contact_group_members: {
        Row: ContactGroupMember;
        Insert: Partial<ContactGroupMember> & { group_id: string; contact_id: string; org_id: string };
        Update: Partial<ContactGroupMember>;
        Relationships: [
          {
            foreignKeyName: "contact_group_members_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
      contact_columns: {
        Row: ContactColumn;
        Insert: Partial<ContactColumn> & { org_id: string; key: string; label: string };
        Update: Partial<ContactColumn>;
        Relationships: [];
      };
      bot_runs: {
        Row: BotRun;
        Insert: Partial<BotRun> & { org_id: string };
        Update: Partial<BotRun>;
        Relationships: [
          {
            foreignKeyName: "bot_runs_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bot_runs_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      campaign_progress: {
        Row: {
          campaign_id: string;
          org_id: string;
          total: number;
          sent: number;
          failed: number;
          pending: number;
        };
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
  };
}
