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
      arquivos: {
        Row: {
          caso_id: string
          caso_id_origem: string | null
          created_at: string
          id: string
          mime_type: string | null
          nome: string
          storage_path: string
          tipo: string | null
        }
        Insert: {
          caso_id: string
          caso_id_origem?: string | null
          created_at?: string
          id?: string
          mime_type?: string | null
          nome: string
          storage_path: string
          tipo?: string | null
        }
        Update: {
          caso_id?: string
          caso_id_origem?: string | null
          created_at?: string
          id?: string
          mime_type?: string | null
          nome?: string
          storage_path?: string
          tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "arquivos_caso_id_fkey"
            columns: ["caso_id"]
            isOneToOne: false
            referencedRelation: "casos"
            referencedColumns: ["id"]
          },
        ]
      }
      casos: {
        Row: {
          cliente_recorrente_ref: string | null
          contracheques: Json | null
          cpf: string | null
          cpf_pre_extraido: string | null
          created_at: string
          created_by: string | null
          documentos_gerados: Json | null
          endereco: Json | null
          erro_processamento: string | null
          id: string
          mesclado_at: string | null
          mesclado_em: string | null
          message_id: string | null
          nome_cliente: string | null
          nome_pre_extraido: string | null
          numero_pasta: string | null
          origem: string
          possivel_duplicata_de: string | null
          rg: string | null
          status: string
          updated_at: string
        }
        Insert: {
          cliente_recorrente_ref?: string | null
          contracheques?: Json | null
          cpf?: string | null
          cpf_pre_extraido?: string | null
          created_at?: string
          created_by?: string | null
          documentos_gerados?: Json | null
          endereco?: Json | null
          erro_processamento?: string | null
          id?: string
          mesclado_at?: string | null
          mesclado_em?: string | null
          message_id?: string | null
          nome_cliente?: string | null
          nome_pre_extraido?: string | null
          numero_pasta?: string | null
          origem?: string
          possivel_duplicata_de?: string | null
          rg?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          cliente_recorrente_ref?: string | null
          contracheques?: Json | null
          cpf?: string | null
          cpf_pre_extraido?: string | null
          created_at?: string
          created_by?: string | null
          documentos_gerados?: Json | null
          endereco?: Json | null
          erro_processamento?: string | null
          id?: string
          mesclado_at?: string | null
          mesclado_em?: string | null
          message_id?: string | null
          nome_cliente?: string | null
          nome_pre_extraido?: string | null
          numero_pasta?: string | null
          origem?: string
          possivel_duplicata_de?: string | null
          rg?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "casos_cliente_recorrente_ref_fkey"
            columns: ["cliente_recorrente_ref"]
            isOneToOne: false
            referencedRelation: "casos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casos_mesclado_em_fkey"
            columns: ["mesclado_em"]
            isOneToOne: false
            referencedRelation: "casos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casos_possivel_duplicata_de_fkey"
            columns: ["possivel_duplicata_de"]
            isOneToOne: false
            referencedRelation: "casos"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          created_at: string
          id: string
          nome: string
          storage_path: string
          tipo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          storage_path: string
          tipo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          storage_path?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: []
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
          role: Database["public"]["Enums"]["app_role"]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
