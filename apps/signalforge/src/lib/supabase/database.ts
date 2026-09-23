export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; display_name: string | null; avatar_url: string | null; created_at: string; updated_at: string };
        Insert: { id: string; display_name?: string | null; avatar_url?: string | null };
        Update: { display_name?: string | null; avatar_url?: string | null };
        Relationships: [];
      };
      forge_runs: {
        Row: {
          id: string; user_id: string; idempotency_key: string; title: string; objective: string;
          decision: string; request_payload: Json; result_payload: Json; receipt_hash: string;
          receipt_schema_version: string; economic_model_version: string; policy_version: string;
          created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; user_id: string; idempotency_key: string; title: string; objective: string;
          decision: string; request_payload: Json; result_payload: Json; receipt_hash: string;
          receipt_schema_version: string; economic_model_version: string; policy_version: string;
        };
        Update: { title?: string };
        Relationships: [];
      };
      source_synthesis_runs: {
        Row: { id: string; user_id: string; run_id: string; objective: string; receipt_payload: Json; receipt_hash: string; created_at: string };
        Insert: { id?: string; user_id: string; run_id: string; objective: string; receipt_payload: Json; receipt_hash: string };
        Update: Record<string, never>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
