export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      advisor_events: {
        Row: {
          id: string;
          event_name: string;
          user_id: string | null;
          conversation_id: string | null;
          request_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_name: string;
          user_id?: string | null;
          conversation_id?: string | null;
          request_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: { event_name?: string; metadata?: Json };
        Relationships: [];
      };
      advisor_document_cache: {
        Row: {
          cache_key: string;
          created_at: string;
          fetched_at: string;
          prompt_text: string;
          reference_text: string;
          updated_at: string;
        };
        Insert: {
          cache_key: string;
          created_at?: string;
          fetched_at: string;
          prompt_text: string;
          reference_text: string;
          updated_at?: string;
        };
        Update: {
          cache_key?: string;
          created_at?: string;
          fetched_at?: string;
          prompt_text?: string;
          reference_text?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      advisor_turn_logs: {
        Row: {
          assistant_response: string | null;
          block_reason: string | null;
          completed_at: string | null;
          completion_tokens: number | null;
          conversation_id: string | null;
          created_at: string;
          document_source: string | null;
          error_code: string | null;
          est_cost_usd: number | null;
          id: string;
          model: string | null;
          prompt_tokens: number | null;
          request_id: string;
          status: string;
          total_tokens: number | null;
          user_id: string;
          user_input: string;
        };
        Insert: {
          assistant_response?: string | null;
          block_reason?: string | null;
          completed_at?: string | null;
          completion_tokens?: number | null;
          conversation_id?: string | null;
          created_at?: string;
          document_source?: string | null;
          error_code?: string | null;
          est_cost_usd?: number | null;
          id?: string;
          model?: string | null;
          prompt_tokens?: number | null;
          request_id: string;
          status?: string;
          total_tokens?: number | null;
          user_id: string;
          user_input: string;
        };
        Update: {
          assistant_response?: string | null;
          block_reason?: string | null;
          completed_at?: string | null;
          completion_tokens?: number | null;
          conversation_id?: string | null;
          created_at?: string;
          document_source?: string | null;
          error_code?: string | null;
          est_cost_usd?: number | null;
          id?: string;
          model?: string | null;
          prompt_tokens?: number | null;
          request_id?: string;
          status?: string;
          total_tokens?: number | null;
          user_id?: string;
          user_input?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'advisor_turn_logs_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          },
        ];
      };
      conversations: {
        Row: {
          created_at: string;
          id: string;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          title?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          content: string;
          conversation_id: string;
          created_at: string;
          est_cost_usd: number | null;
          id: string;
          request_id: string;
          role: string;
          sequence: number;
          status: string;
          token_count: number | null;
        };
        Insert: {
          content: string;
          conversation_id: string;
          created_at?: string;
          est_cost_usd?: number | null;
          id?: string;
          request_id: string;
          role: string;
          sequence: number;
          status?: string;
          token_count?: number | null;
        };
        Update: {
          content?: string;
          conversation_id?: string;
          created_at?: string;
          est_cost_usd?: number | null;
          id?: string;
          request_id?: string;
          role?: string;
          sequence?: number;
          status?: string;
          token_count?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'messages_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          email: string | null;
          id: string;
          is_allowed: boolean;
          role: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          id: string;
          is_allowed?: boolean;
          role?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          id?: string;
          is_allowed?: boolean;
          role?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      usage_counters: {
        Row: {
          est_spend_today: number;
          messages_today: number;
          tokens_today: number;
          updated_at: string;
          usage_day: string;
          user_id: string;
        };
        Insert: {
          est_spend_today?: number;
          messages_today?: number;
          tokens_today?: number;
          updated_at?: string;
          usage_day: string;
          user_id: string;
        };
        Update: {
          est_spend_today?: number;
          messages_today?: number;
          tokens_today?: number;
          updated_at?: string;
          usage_day?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      reserve_advisor_tokens: {
        Args: {
          p_user_id: string;
          p_conversation_id: string;
          p_request_id: string;
          p_token_budget: number;
          p_daily_token_limit: number;
        };
        Returns: Json;
      };
      start_advisor_provider: {
        Args: {
          p_user_id: string;
          p_conversation_id: string;
          p_request_id: string;
        };
        Returns: undefined;
      };

      begin_advisor_turn: {
        Args: {
          p_conversation_id: string;
          p_daily_message_limit: number;
          p_daily_token_limit: number;
          p_request_id: string;
          p_requests_per_minute: number;
          p_user_id: string;
          p_user_input: string;
        };
        Returns: Json;
      };
      complete_advisor_turn: {
        Args: {
          p_assistant_response: string;
          p_completion_tokens: number | null;
          p_conversation_id: string;
          p_document_source: string;
          p_est_cost_usd: number | null;
          p_model: string;
          p_prompt_tokens: number | null;
          p_request_id: string;
          p_total_tokens: number | null;
          p_user_id: string;
        };
        Returns: Json;
      };
      fail_advisor_turn: {
        Args: {
          p_conversation_id: string;
          p_document_source: string | null;
          p_error_code: string;
          p_request_id: string;
          p_user_id: string;
        };
        Returns: Json;
      };
      save_fixed_turn: {
        Args: {
          p_assistant_content: string;
          p_conversation_id: string;
          p_request_id: string;
          p_user_content: string;
          p_user_id: string;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  'public'
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
