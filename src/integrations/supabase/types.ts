export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          created_at: string
          detail: string | null
          id: string
          metadata: Json
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          detail?: string | null
          id?: string
          metadata?: Json
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          detail?: string | null
          id?: string
          metadata?: Json
          user_id?: string | null
        }
        Relationships: []
      }
      admin_audit_logs: {
        Row: {
          action: string
          admin_email: string | null
          admin_id: string | null
          created_at: string
          duration_days: number | null
          id: string
          metadata: Json
          new_plan: string | null
          new_status: string | null
          old_plan: string | null
          old_status: string | null
          reason: string | null
          target_email: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          admin_email?: string | null
          admin_id?: string | null
          created_at?: string
          duration_days?: number | null
          id?: string
          metadata?: Json
          new_plan?: string | null
          new_status?: string | null
          old_plan?: string | null
          old_status?: string | null
          reason?: string | null
          target_email?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          admin_email?: string | null
          admin_id?: string | null
          created_at?: string
          duration_days?: number | null
          id?: string
          metadata?: Json
          new_plan?: string | null
          new_status?: string | null
          old_plan?: string | null
          old_status?: string | null
          reason?: string | null
          target_email?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      guest_usage: {
        Row: {
          created_at: string
          fingerprint: string
          id: string
          updated_at: string
          used: number
        }
        Insert: {
          created_at?: string
          fingerprint: string
          id?: string
          updated_at?: string
          used?: number
        }
        Update: {
          created_at?: string
          fingerprint?: string
          id?: string
          updated_at?: string
          used?: number
        }
        Relationships: []
      }
      invoices: {
        Row: {
          archive_month: string
          created_at: string
          currency: string | null
          data: Json
          discount: number
          file_name: string
          file_path: string | null
          id: string
          invoice_date: string | null
          invoice_number: string | null
          status: string
          subtotal: number
          supplier: string | null
          tax: number
          total: number
          user_id: string
        }
        Insert: {
          archive_month?: string
          created_at?: string
          currency?: string | null
          data: Json
          discount?: number
          file_name: string
          file_path?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          status?: string
          subtotal?: number
          supplier?: string | null
          tax?: number
          total?: number
          user_id?: string
        }
        Update: {
          archive_month?: string
          created_at?: string
          currency?: string | null
          data?: Json
          discount?: number
          file_name?: string
          file_path?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          status?: string
          subtotal?: number
          supplier?: string | null
          tax?: number
          total?: number
          user_id?: string
        }
        Relationships: []
      }
      payment_events: {
        Row: {
          created_at: string
          error: string | null
          event_id: string
          event_type: string | null
          id: string
          payload: Json
          processed_at: string | null
          provider: string
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          event_id: string
          event_type?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          provider: string
          status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          event_id?: string
          event_type?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          provider?: string
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      plans: {
        Row: {
          billing_interval: string
          code: string
          created_at: string
          currency: string
          description: string | null
          features: Json
          invoice_limit: number
          is_active: boolean
          name: string
          price_cents: number
          processing_limit: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          billing_interval?: string
          code: string
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json
          invoice_limit?: number
          is_active?: boolean
          name: string
          price_cents?: number
          processing_limit?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          billing_interval?: string
          code?: string
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json
          invoice_limit?: number
          is_active?: boolean
          name?: string
          price_cents?: number
          processing_limit?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          billing_type: string
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          email: string | null
          id: string
          last_activity: string | null
          last_login_at: string | null
          monthly_invoice_limit: number
          monthly_invoice_usage: number
          name: string | null
          payment_provider: string | null
          plan: string
          provider_subscription_id: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_end: string | null
          subscription_id: string | null
          subscription_start: string | null
          subscription_status: string
          updated_at: string
          usage_month: string
        }
        Insert: {
          billing_type?: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          email?: string | null
          id: string
          last_activity?: string | null
          last_login_at?: string | null
          monthly_invoice_limit?: number
          monthly_invoice_usage?: number
          name?: string | null
          payment_provider?: string | null
          plan?: string
          provider_subscription_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_end?: string | null
          subscription_id?: string | null
          subscription_start?: string | null
          subscription_status?: string
          updated_at?: string
          usage_month?: string
        }
        Update: {
          billing_type?: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          email?: string | null
          id?: string
          last_activity?: string | null
          last_login_at?: string | null
          monthly_invoice_limit?: number
          monthly_invoice_usage?: number
          name?: string | null
          payment_provider?: string | null
          plan?: string
          provider_subscription_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_end?: string | null
          subscription_id?: string | null
          subscription_start?: string | null
          subscription_status?: string
          updated_at?: string
          usage_month?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          billing_type: string
          cancelled_at: string | null
          created_at: string
          id: string
          metadata: Json
          payment_provider: string | null
          plan: string
          provider_subscription_id: string | null
          status: string
          subscription_end: string | null
          subscription_start: string
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_type?: string
          cancelled_at?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          payment_provider?: string | null
          plan?: string
          provider_subscription_id?: string | null
          status?: string
          subscription_end?: string | null
          subscription_start?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_type?: string
          cancelled_at?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          payment_provider?: string | null
          plan?: string
          provider_subscription_id?: string | null
          status?: string
          subscription_end?: string | null
          subscription_start?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_fkey"
            columns: ["plan"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["code"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_usage_stats: {
        Row: {
          created_at: string
          excel_exports: number
          invoices_processed: number
          last_activity: string | null
          pdf_exports: number
          processing_operations: number
          processing_requests: number
          temp_uploads: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          excel_exports?: number
          invoices_processed?: number
          last_activity?: string | null
          pdf_exports?: number
          processing_operations?: number
          processing_requests?: number
          temp_uploads?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          excel_exports?: number
          invoices_processed?: number
          last_activity?: string | null
          pdf_exports?: number
          processing_operations?: number
          processing_requests?: number
          temp_uploads?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_subscription: {
        Args: {
          _billing_type: string
          _end: string
          _metadata?: Json
          _payment_provider: string
          _plan: string
          _provider_subscription_id: string
          _start: string
          _status: string
          _user_id: string
        }
        Returns: {
          billing_type: string
          cancelled_at: string | null
          created_at: string
          id: string
          metadata: Json
          payment_provider: string | null
          plan: string
          provider_subscription_id: string | null
          status: string
          subscription_end: string | null
          subscription_start: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      bump_usage: {
        Args: {
          _excel_exports?: number
          _invoices_processed?: number
          _pdf_exports?: number
          _processing_operations?: number
          _processing_requests?: number
          _temp_uploads?: number
          _user_id: string
        }
        Returns: undefined
      }
      consume_guest_quota: {
        Args: { _fingerprint: string; _limit?: number }
        Returns: Json
      }
      consume_invoice_quota: {
        Args: { _email?: string; _user_id: string }
        Returns: Json
      }
      ensure_profile: {
        Args: { _email?: string; _user_id: string }
        Returns: {
          billing_type: string
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          email: string | null
          id: string
          last_activity: string | null
          last_login_at: string | null
          monthly_invoice_limit: number
          monthly_invoice_usage: number
          name: string | null
          payment_provider: string | null
          plan: string
          provider_subscription_id: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_end: string | null
          subscription_id: string | null
          subscription_start: string | null
          subscription_status: string
          updated_at: string
          usage_month: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      expire_due_subscriptions: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      refund_guest_quota: { Args: { _fingerprint: string }; Returns: undefined }
      refund_invoice_quota: { Args: { _user_id: string }; Returns: undefined }
      revoke_subscription: {
        Args: { _reason?: string; _user_id: string }
        Returns: undefined
      }
      sync_profile_subscription: {
        Args: { _user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
