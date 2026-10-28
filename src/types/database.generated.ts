
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {

  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "brands": {
                  Row: {
                    "created_at": string,"id": string,"image_path": string | null,"name": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"image_path"?: string | null,"name": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"image_path"?: string | null,"name"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [

                  ]
                },"categories": {
                  Row: {
                    "is_active": boolean,"label_ko": string,"parent_slug": string | null,"position": number,"slug": string
                  }
                  ComputedFields: never
                  Insert: {
                    "is_active"?: boolean,"label_ko": string,"parent_slug"?: string | null,"position"?: number,"slug": string
                  }
                  Update: {
                    "is_active"?: boolean,"label_ko"?: string,"parent_slug"?: string | null,"position"?: number,"slug"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_parent_slug_fkey"
      columns: ["parent_slug"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["slug"]
    }
                  ]
                },"import_jobs": {
                  Row: {
                    "created_at": string,"error_message": string | null,"extracted_data": NonNullable<Json>,"id": string,"item_id": string | null,"source_url": string,"status": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"error_message"?: string | null,"extracted_data"?: NonNullable<Json>,"id"?: string,"item_id"?: string | null,"source_url": string,"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"error_message"?: string | null,"extracted_data"?: NonNullable<Json>,"id"?: string,"item_id"?: string | null,"source_url"?: string,"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "import_jobs_item_id_user_id_fkey"
      columns: ["item_id","user_id"]
isOneToOne: false
      referencedRelation: "item_wear_stats"
      referencedColumns: ["item_id","user_id"]
    },{
      foreignKeyName: "import_jobs_item_id_user_id_fkey"
      columns: ["item_id","user_id"]
isOneToOne: false
      referencedRelation: "wardrobe_items"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"item_images": {
                  Row: {
                    "created_at": string,"id": string,"image_order": number,"is_primary": boolean,"item_id": string,"source_kind": string,"storage_path": string,"upload_status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"image_order"?: number,"is_primary"?: boolean,"item_id": string,"source_kind"?: string,"storage_path": string,"upload_status"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"image_order"?: number,"is_primary"?: boolean,"item_id"?: string,"source_kind"?: string,"storage_path"?: string,"upload_status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "item_images_item_id_user_id_fkey"
      columns: ["item_id","user_id"]
isOneToOne: false
      referencedRelation: "item_wear_stats"
      referencedColumns: ["item_id","user_id"]
    },{
      foreignKeyName: "item_images_item_id_user_id_fkey"
      columns: ["item_id","user_id"]
isOneToOne: false
      referencedRelation: "wardrobe_items"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"outfit_items": {
                  Row: {
                    "created_at": string,"id": string,"item_id": string,"outfit_id": string,"position": number,"slot": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"item_id": string,"outfit_id": string,"position"?: number,"slot": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"item_id"?: string,"outfit_id"?: string,"position"?: number,"slot"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "outfit_items_item_id_user_id_fkey"
      columns: ["item_id","user_id"]
isOneToOne: false
      referencedRelation: "item_wear_stats"
      referencedColumns: ["item_id","user_id"]
    },{
      foreignKeyName: "outfit_items_item_id_user_id_fkey"
      columns: ["item_id","user_id"]
isOneToOne: false
      referencedRelation: "wardrobe_items"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "outfit_items_outfit_id_user_id_fkey"
      columns: ["outfit_id","user_id"]
isOneToOne: false
      referencedRelation: "outfits"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"outfits": {
                  Row: {
                    "created_at": string,"deleted_at": string | null,"id": string,"is_favorite": boolean,"memo": string | null,"name": string,"occasion": string | null,"seasons": (string)[],"tags": (string)[],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"deleted_at"?: string | null,"id"?: string,"is_favorite"?: boolean,"memo"?: string | null,"name": string,"occasion"?: string | null,"seasons"?: (string)[],"tags"?: (string)[],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"deleted_at"?: string | null,"id"?: string,"is_favorite"?: boolean,"memo"?: string | null,"name"?: string,"occasion"?: string | null,"seasons"?: (string)[],"tags"?: (string)[],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [

                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"default_currency": string,"display_name": string | null,"id": string,"theme": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"default_currency"?: string,"display_name"?: string | null,"id": string,"theme"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"default_currency"?: string,"display_name"?: string | null,"id"?: string,"theme"?: string,"updated_at"?: string
                  }
                  Relationships: [

                  ]
                },"wardrobe_items": {
                  Row: {
                    "brand_id": string | null,"brand_name": string | null,"category_slug": string,"color_hex": string | null,"color_name": string | null,"created_at": string,"currency": string,"deleted_at": string | null,"id": string,"is_favorite": boolean,"lifecycle_status": string,"material": string | null,"name": string,"notes": string | null,"purchase_price": number | null,"purchase_url": string | null,"purchased_on": string | null,"seasons": (string)[],"size_label": string | null,"tags": (string)[],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_id"?: string | null,"brand_name"?: string | null,"category_slug": string,"color_hex"?: string | null,"color_name"?: string | null,"created_at"?: string,"currency"?: string,"deleted_at"?: string | null,"id"?: string,"is_favorite"?: boolean,"lifecycle_status"?: string,"material"?: string | null,"name": string,"notes"?: string | null,"purchase_price"?: number | null,"purchase_url"?: string | null,"purchased_on"?: string | null,"seasons"?: (string)[],"size_label"?: string | null,"tags"?: (string)[],"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "brand_id"?: string | null,"brand_name"?: string | null,"category_slug"?: string,"color_hex"?: string | null,"color_name"?: string | null,"created_at"?: string,"currency"?: string,"deleted_at"?: string | null,"id"?: string,"is_favorite"?: boolean,"lifecycle_status"?: string,"material"?: string | null,"name"?: string,"notes"?: string | null,"purchase_price"?: number | null,"purchase_url"?: string | null,"purchased_on"?: string | null,"seasons"?: (string)[],"size_label"?: string | null,"tags"?: (string)[],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "wardrobe_brand_owner_fk"
      columns: ["brand_id","user_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "wardrobe_items_category_slug_fkey"
      columns: ["category_slug"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["slug"]
    }
                  ]
                },"wear_event_items": {
                  Row: {
                    "created_at": string,"item_id": string,"user_id": string,"wear_event_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"item_id": string,"user_id": string,"wear_event_id": string
                  }
                  Update: {
                    "created_at"?: string,"item_id"?: string,"user_id"?: string,"wear_event_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "wear_event_items_item_id_user_id_fkey"
      columns: ["item_id","user_id"]
isOneToOne: false
      referencedRelation: "item_wear_stats"
      referencedColumns: ["item_id","user_id"]
    },{
      foreignKeyName: "wear_event_items_item_id_user_id_fkey"
      columns: ["item_id","user_id"]
isOneToOne: false
      referencedRelation: "wardrobe_items"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "wear_event_items_wear_event_id_user_id_fkey"
      columns: ["wear_event_id","user_id"]
isOneToOne: false
      referencedRelation: "wear_events"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"wear_events": {
                  Row: {
                    "created_at": string,"deleted_at": string | null,"id": string,"memo": string | null,"outfit_id": string | null,"source_outfit_id": string | null,"source_outfit_updated_at": string | null,"updated_at": string,"user_id": string,"worn_on": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"deleted_at"?: string | null,"id"?: string,"memo"?: string | null,"outfit_id"?: string | null,"source_outfit_id"?: string | null,"source_outfit_updated_at"?: string | null,"updated_at"?: string,"user_id": string,"worn_on": string
                  }
                  Update: {
                    "created_at"?: string,"deleted_at"?: string | null,"id"?: string,"memo"?: string | null,"outfit_id"?: string | null,"source_outfit_id"?: string | null,"source_outfit_updated_at"?: string | null,"updated_at"?: string,"user_id"?: string,"worn_on"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "wear_events_outfit_id_user_id_fkey"
      columns: ["outfit_id","user_id"]
isOneToOne: false
      referencedRelation: "outfits"
      referencedColumns: ["id","user_id"]
    }
                  ]
                }
          }
          Views: {
            "item_wear_stats": {
                  Row: {
                    "cost_per_wear": number | null,"item_id": string,"last_worn_on": string | null,"user_id": string,"wear_count": number | null
                  }
                  ComputedFields: never
                  Relationships: [

                  ]
                }
          }
          Functions: {
            "complete_item_image":
{ Args: { "p_image_id": string }; Returns: {
              "created_at": string,
"id": string,
"image_order": number,
"is_primary": boolean,
"item_id": string,
"source_kind": string,
"storage_path": string,
"upload_status": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "item_images"
        isOneToOne: true
        isSetofReturn: false
      } },
"copy_outfit":
{ Args: { "p_expected": string,"p_id": string,"p_source": string }; Returns: {
              "created_at": string,
"deleted_at": string | null,
"id": string,
"is_favorite": boolean,
"memo": string | null,
"name": string,
"occasion": string | null,
"seasons": (string)[],
"tags": (string)[],
"updated_at": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "outfits"
        isOneToOne: true
        isSetofReturn: false
      } },
"delete_outfit":
{ Args: { "p_expected": string,"p_id": string }; Returns: {
              "created_at": string,
"deleted_at": string | null,
"id": string,
"is_favorite": boolean,
"memo": string | null,
"name": string,
"occasion": string | null,
"seasons": (string)[],
"tags": (string)[],
"updated_at": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "outfits"
        isOneToOne: true
        isSetofReturn: false
      } },
"delete_wear_event":
{ Args: { "p_expected": string,"p_id": string }; Returns: {
              "created_at": string,
"deleted_at": string | null,
"id": string,
"memo": string | null,
"outfit_id": string | null,
"source_outfit_id": string | null,
"source_outfit_updated_at": string | null,
"updated_at": string,
"user_id": string,
"worn_on": string
            }
                          SetofOptions: {
        from: "*"
        to: "wear_events"
        isOneToOne: true
        isSetofReturn: false
      } },
"insight_item_stats":
{ Args: { "p_as_of": string,"p_days"?: number,"p_mode"?: string,"p_owner": string,"p_search"?: string }; Returns: {
              "brand_name": string,"category_slug": string,"cost_per_wear": number,"created_at": string,"currency": string,"item_id": string,"last_worn_on": string,"lifecycle_status": string,"lifetime_wear_count": number,"name": string,"period_wear_count": number,"purchase_price": number
            }[]
                           },
"outfit_filter_options":
{ Args: { "p_owner": string }; Returns: {
              "brands": (string)[],"tags": (string)[]
            }[]
                           },
"record_wear_event":
{ Args: { "p_id": string,"p_items"?: (string)[],"p_memo"?: string,"p_outfit"?: string,"p_outfit_expected"?: string,"p_worn_on": string }; Returns: {
              "created_at": string,
"deleted_at": string | null,
"id": string,
"memo": string | null,
"outfit_id": string | null,
"source_outfit_id": string | null,
"source_outfit_updated_at": string | null,
"updated_at": string,
"user_id": string,
"worn_on": string
            }
                          SetofOptions: {
        from: "*"
        to: "wear_events"
        isOneToOne: true
        isSetofReturn: false
      } },
"remove_item_image":
{ Args: { "p_image_id": string }; Returns: undefined
                           },
"reserve_item_image":
{ Args: { "p_extension"?: string,"p_image_id": string,"p_item_id": string }; Returns: {
              "created_at": string,
"id": string,
"image_order": number,
"is_primary": boolean,
"item_id": string,
"source_kind": string,
"storage_path": string,
"upload_status": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "item_images"
        isOneToOne: true
        isSetofReturn: false
      } },
"save_brand":
{ Args: { "p_expected"?: string,"p_id": string,"p_name": string }; Returns: {
              "created_at": string,
"id": string,
"image_path": string | null,
"name": string,
"updated_at": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "brands"
        isOneToOne: true
        isSetofReturn: false
      } },
"save_outfit":
{ Args: { "p_draft"?: Json,"p_expected"?: string,"p_id": string }; Returns: {
              "created_at": string,
"deleted_at": string | null,
"id": string,
"is_favorite": boolean,
"memo": string | null,
"name": string,
"occasion": string | null,
"seasons": (string)[],
"tags": (string)[],
"updated_at": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "outfits"
        isOneToOne: true
        isSetofReturn: false
      } },
"search_outfits":
{ Args: { "p_brand"?: string,"p_favorite_only"?: boolean,"p_owner": string,"p_search"?: string,"p_season"?: string,"p_sort"?: string,"p_tag"?: string }; Returns: {
              "created_at": string,
"deleted_at": string | null,
"id": string,
"is_favorite": boolean,
"memo": string | null,
"name": string,
"occasion": string | null,
"seasons": (string)[],
"tags": (string)[],
"updated_at": string,
"user_id": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "outfits"
        isOneToOne: false
        isSetofReturn: true
      } },
"search_wardrobe_items":
{ Args: { "p_brand"?: string,"p_category"?: string,"p_color"?: string,"p_favorite_only"?: boolean,"p_owner": string,"p_search"?: string,"p_season"?: string,"p_sort"?: string,"p_status"?: string }; Returns: {
              "brand_id": string | null,
"brand_name": string | null,
"category_slug": string,
"color_hex": string | null,
"color_name": string | null,
"created_at": string,
"currency": string,
"deleted_at": string | null,
"id": string,
"is_favorite": boolean,
"lifecycle_status": string,
"material": string | null,
"name": string,
"notes": string | null,
"purchase_price": number | null,
"purchase_url": string | null,
"purchased_on": string | null,
"seasons": (string)[],
"size_label": string | null,
"tags": (string)[],
"updated_at": string,
"user_id": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "wardrobe_items"
        isOneToOne: false
        isSetofReturn: true
      } },
"set_brand_image":
{ Args: { "p_expected": string,"p_id": string,"p_path": string }; Returns: {
              "created_at": string,
"id": string,
"image_path": string | null,
"name": string,
"updated_at": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "brands"
        isOneToOne: true
        isSetofReturn: false
      } },
"set_primary_item_image":
{ Args: { "p_image_id": string }; Returns: undefined
                           },
"update_wear_event":
{ Args: { "p_expected": string,"p_id": string,"p_items"?: (string)[],"p_memo"?: string,"p_mode"?: string,"p_outfit"?: string,"p_outfit_expected"?: string,"p_worn_on": string }; Returns: {
              "created_at": string,
"deleted_at": string | null,
"id": string,
"memo": string | null,
"outfit_id": string | null,
"source_outfit_id": string | null,
"source_outfit_updated_at": string | null,
"updated_at": string,
"user_id": string,
"worn_on": string
            }
                          SetofOptions: {
        from: "*"
        to: "wear_events"
        isOneToOne: true
        isSetofReturn: false
      } },
"wardrobe_filter_options":
{ Args: { "p_owner": string }; Returns: {
              "brands": (string)[],"colors": (string)[]
            }[]
                           },
"wardrobe_insights":
{ Args: { "p_as_of": string,"p_days"?: number,"p_owner": string }; Returns: Json
                           },
"wardrobe_item_usage":
{ Args: { "p_item": string,"p_owner": string }; Returns: {
              "outfit_count": number,"outfit_names": (string)[],"wear_count": number
            }[]
                           },
"wear_day_counts":
{ Args: { "p_end": string,"p_owner": string,"p_start": string }; Returns: {
              "event_count": number,"worn_on": string
            }[]
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {

          }
        },"public": {
          Enums: {

          }
        }
} as const
