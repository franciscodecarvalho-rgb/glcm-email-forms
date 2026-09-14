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
          empregadores: Json
          endereco: Json | null
          erro_processamento: string | null
          escritorios: Json
          honorarios_pct: number | null
          id: string
          limite_viabilidade: number
          mesclado_at: string | null
          mesclado_em: string | null
          message_id: string | null
          nome_cliente: string | null
          nome_pre_extraido: string | null
          numero_pasta: string | null
          origem: string
          possivel_duplicata_de: string | null
          qualificacao: Json
          rg: string | null
          status: string
          tipo_acao: string
          updated_at: string
          valor_causa: number | null
        }
        Insert: {
          cliente_recorrente_ref?: string | null
          contracheques?: Json | null
          cpf?: string | null
          cpf_pre_extraido?: string | null
          created_at?: string
          created_by?: string | null
          documentos_gerados?: Json | null
          empregadores?: Json
          endereco?: Json | null
          erro_processamento?: string | null
          escritorios?: Json
          honorarios_pct?: number | null
          id?: string
          limite_viabilidade?: number
          mesclado_at?: string | null
          mesclado_em?: string | null
          message_id?: string | null
          nome_cliente?: string | null
          nome_pre_extraido?: string | null
          numero_pasta?: string | null
          origem?: string
          possivel_duplicata_de?: string | null
          qualificacao?: Json
          rg?: string | null
          status?: string
          tipo_acao?: string
          updated_at?: string
          valor_causa?: number | null
        }
        Update: {
          cliente_recorrente_ref?: string | null
          contracheques?: Json | null
          cpf?: string | null
          cpf_pre_extraido?: string | null
          created_at?: string
          created_by?: string | null
          documentos_gerados?: Json | null
          empregadores?: Json
          endereco?: Json | null
          erro_processamento?: string | null
          escritorios?: Json
          honorarios_pct?: number | null
          id?: string
          limite_viabilidade?: number
          mesclado_at?: string | null
          mesclado_em?: string | null
          message_id?: string | null
          nome_cliente?: string | null
          nome_pre_extraido?: string | null
          numero_pasta?: string | null
          origem?: string
          possivel_duplicata_de?: string | null
          qualificacao?: Json
          rg?: string | null
          status?: string
          tipo_acao?: string
          updated_at?: string
          valor_causa?: number | null
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
      contracheques: {
        Row: {
          arquivo_origem: string | null
          caso_id: string
          competencia: string | null
          created_at: string
          id: string
          liquido: number | null
          modelo_origem: string | null
          salario_base: number | null
          total_descontos: number | null
          total_proventos: number | null
        }
        Insert: {
          arquivo_origem?: string | null
          caso_id: string
          competencia?: string | null
          created_at?: string
          id?: string
          liquido?: number | null
          modelo_origem?: string | null
          salario_base?: number | null
          total_descontos?: number | null
          total_proventos?: number | null
        }
        Update: {
          arquivo_origem?: string | null
          caso_id?: string
          competencia?: string | null
          created_at?: string
          id?: string
          liquido?: number | null
          modelo_origem?: string | null
          salario_base?: number | null
          total_descontos?: number | null
          total_proventos?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contracheques_caso_id_fkey"
            columns: ["caso_id"]
            isOneToOne: false
            referencedRelation: "casos"
            referencedColumns: ["id"]
          },
        ]
      }
      finalizacoes_extracao: {
        Row: {
          caso_id: string
          criado_em: string
        }
        Insert: {
          caso_id: string
          criado_em?: string
        }
        Update: {
          caso_id?: string
          criado_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "finalizacoes_extracao_caso_id_fkey"
            columns: ["caso_id"]
            isOneToOne: true
            referencedRelation: "casos"
            referencedColumns: ["id"]
          },
        ]
      }
      itens_contracheque: {
        Row: {
          codigo: string | null
          contracheque_id: string
          created_at: string
          descricao: string | null
          familia_hra: string | null
          id: string
          referencia: number | null
          tipo: string | null
          valor: number | null
        }
        Insert: {
          codigo?: string | null
          contracheque_id: string
          created_at?: string
          descricao?: string | null
          familia_hra?: string | null
          id?: string
          referencia?: number | null
          tipo?: string | null
          valor?: number | null
        }
        Update: {
          codigo?: string | null
          contracheque_id?: string
          created_at?: string
          descricao?: string | null
          familia_hra?: string | null
          id?: string
          referencia?: number | null
          tipo?: string | null
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "itens_contracheque_contracheque_id_fkey"
            columns: ["contracheque_id"]
            isOneToOne: false
            referencedRelation: "contracheques"
            referencedColumns: ["id"]
          },
        ]
      }
      lotes_contracheques: {
        Row: {
          arquivo_id: string
          atualizado_em: string
          caso_id: string
          erro: string | null
          estado_saida: Json | null
          ia_status: string | null
          id: string
          ordem: number
          pagina_fim: number
          pagina_inicio: number
          status: string
          storage_path: string | null
        }
        Insert: {
          arquivo_id: string
          atualizado_em?: string
          caso_id: string
          erro?: string | null
          estado_saida?: Json | null
          ia_status?: string | null
          id?: string
          ordem: number
          pagina_fim: number
          pagina_inicio: number
          status?: string
          storage_path?: string | null
        }
        Update: {
          arquivo_id?: string
          atualizado_em?: string
          caso_id?: string
          erro?: string | null
          estado_saida?: Json | null
          ia_status?: string | null
          id?: string
          ordem?: number
          pagina_fim?: number
          pagina_inicio?: number
          status?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lotes_contracheques_arquivo_id_fkey"
            columns: ["arquivo_id"]
            isOneToOne: false
            referencedRelation: "arquivos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_contracheques_caso_id_fkey"
            columns: ["caso_id"]
            isOneToOne: false
            referencedRelation: "casos"
            referencedColumns: ["id"]
          },
        ]
      }
      lotes_extracao: {
        Row: {
          arquivo_ids: string[]
          atualizado_em: string
          caso_id: string
          erro: string | null
          id: string
          ordem: number
          resultado: Json | null
          status: string
        }
        Insert: {
          arquivo_ids: string[]
          atualizado_em?: string
          caso_id: string
          erro?: string | null
          id?: string
          ordem: number
          resultado?: Json | null
          status?: string
        }
        Update: {
          arquivo_ids?: string[]
          atualizado_em?: string
          caso_id?: string
          erro?: string | null
          id?: string
          ordem?: number
          resultado?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "lotes_extracao_caso_id_fkey"
            columns: ["caso_id"]
            isOneToOne: false
            referencedRelation: "casos"
            referencedColumns: ["id"]
          },
        ]
      }
      tema_termos: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          tema_id: string
          termo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          tema_id: string
          termo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          tema_id?: string
          termo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tema_termos_tema_id_fkey"
            columns: ["tema_id"]
            isOneToOne: false
            referencedRelation: "temas"
            referencedColumns: ["id"]
          },
        ]
      }
      temas: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
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
      competencia_para_data: { Args: { _valor: string }; Returns: string }
      cpf_valido: { Args: { _cpf: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      normalizar_cpf_digitos: { Args: { _cpf: string }; Returns: string }
      normalizar_termo_tema: { Args: { _termo: string }; Returns: string }
      relatorio_itens_filtrados: {
        Args: {
          p_ate?: string
          p_de?: string
          p_empresas?: string[]
          p_rubricas?: Json
          p_temas?: Json
        }
        Returns: {
          caso_id: string
          codigo: string
          comp_data: string
          competencia: string
          contracheque_id: string
          descricao: string
          empresa: string
          item_id: string
          pessoa_cpf: string
          pessoa_id: string
          pessoa_identificacao: string
          pessoa_nome: string
          temas: string[]
          tipo: string
          valor: number
        }[]
      }
      relatorio_lancamentos_pessoa: {
        Args: {
          p_ate?: string
          p_de?: string
          p_empresas?: string[]
          p_limit?: number
          p_offset?: number
          p_pessoa_id: string
          p_rubricas?: Json
          p_temas?: Json
        }
        Returns: {
          caso_id: string
          codigo: string
          competencia: string
          descricao: string
          empresa: string
          item_id: string
          tipo: string
          total_linhas: number
          valor: number
        }[]
      }
      relatorio_por_empresa: {
        Args: {
          p_ate?: string
          p_de?: string
          p_empresas?: string[]
          p_limit?: number
          p_offset?: number
          p_rubricas?: Json
          p_temas?: Json
        }
        Returns: {
          descontos: number
          empresa_id: string
          empresa_nome: string
          itens: number
          pessoas: number
          proventos: number
          total_linhas: number
        }[]
      }
      relatorio_por_pessoa: {
        Args: {
          p_ate?: string
          p_de?: string
          p_empresas?: string[]
          p_limit?: number
          p_offset?: number
          p_rubricas?: Json
          p_temas?: Json
        }
        Returns: {
          casos: number
          descontos: number
          itens: number
          pessoa_cpf: string
          pessoa_id: string
          pessoa_identificacao: string
          pessoa_nome: string
          proventos: number
          total_linhas: number
        }[]
      }
      relatorio_rubricas: {
        Args: {
          p_ate?: string
          p_de?: string
          p_empresas?: string[]
          p_limit?: number
          p_offset?: number
          p_rubricas?: Json
          p_temas?: Json
        }
        Returns: {
          codigo: string
          descontos: number
          descricao: string
          empresa: string
          itens: number
          proventos: number
          tipo: string
          total_linhas: number
        }[]
      }
      relatorio_totais_tema: {
        Args: {
          p_ate?: string
          p_de?: string
          p_empresas?: string[]
          p_rubricas?: Json
          p_temas?: Json
        }
        Returns: {
          descontos: number
          itens: number
          proventos: number
          tema: string
        }[]
      }
      relatorio_total_geral: {
        Args: {
          p_ate?: string
          p_de?: string
          p_empresas?: string[]
          p_rubricas?: Json
          p_temas?: Json
        }
        Returns: {
          casos: number
          descontos: number
          empresas: number
          itens: number
          pessoas: number
          pessoas_sem_cpf: number
          proventos: number
        }[]
      }
      salvar_tema: {
        Args: {
          p_ativo?: boolean
          p_descricao?: string
          p_nome: string
          p_tema_id?: string
          p_termos: string[]
        }
        Returns: string
      }
      temas_rubricas_correspondentes: {
        Args: { p_limit?: number; p_offset?: number; p_termos: string[] }
        Returns: {
          codigo: string
          descricao: string
          empresa: string
          ocorrencias: number
          tipo: string
          total_linhas: number
        }[]
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
