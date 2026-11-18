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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      bookings: {
        Row: {
          amount_paid: number
          card_id: string | null
          course_id: string
          created_at: string
          discount_amount: number
          id: string
          order_id: string | null
          paid_with_card: boolean
          payment_id: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          refunded: boolean
          status: Database["public"]["Enums"]["booking_status"]
          updated_at: string
          user_id: string
          voucher_code: string | null
          voucher_id: string | null
        }
        Insert: {
          amount_paid?: number
          card_id?: string | null
          course_id: string
          created_at?: string
          discount_amount?: number
          id?: string
          order_id?: string | null
          paid_with_card?: boolean
          payment_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          refunded?: boolean
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
          user_id: string
          voucher_code?: string | null
          voucher_id?: string | null
        }
        Update: {
          amount_paid?: number
          card_id?: string | null
          course_id?: string
          created_at?: string
          discount_amount?: number
          id?: string
          order_id?: string | null
          paid_with_card?: boolean
          payment_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          refunded?: boolean
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
          user_id?: string
          voucher_code?: string | null
          voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items: {
        Row: {
          card_type: Database["public"]["Enums"]["card_type"] | null
          course_id: string | null
          created_at: string
          id: string
          product_id: string | null
          quantity: number
          user_id: string
        }
        Insert: {
          card_type?: Database["public"]["Enums"]["card_type"] | null
          course_id?: string | null
          created_at?: string
          id?: string
          product_id?: string | null
          quantity?: number
          user_id: string
        }
        Update: {
          card_type?: Database["public"]["Enums"]["card_type"] | null
          course_id?: string | null
          created_at?: string
          id?: string
          product_id?: string | null
          quantity?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      class_cards: {
        Row: {
          amount_paid: number
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          card_type: Database["public"]["Enums"]["card_type"]
          created_at: string
          expires_at: string | null
          grant_note: string | null
          granted_by: string | null
          id: string
          order_id: string | null
          payment_id: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          purchased_at: string
          remaining_credits: number
          status: string
          total_credits: number
          user_id: string
        }
        Insert: {
          amount_paid?: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          card_type: Database["public"]["Enums"]["card_type"]
          created_at?: string
          expires_at?: string | null
          grant_note?: string | null
          granted_by?: string | null
          id?: string
          order_id?: string | null
          payment_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          purchased_at?: string
          remaining_credits: number
          status?: string
          total_credits: number
          user_id: string
        }
        Update: {
          amount_paid?: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          card_type?: Database["public"]["Enums"]["card_type"]
          created_at?: string
          expires_at?: string | null
          grant_note?: string | null
          granted_by?: string | null
          id?: string
          order_id?: string | null
          payment_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          purchased_at?: string
          remaining_credits?: number
          status?: string
          total_credits?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_cards_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          bank_name: string | null
          bic: string | null
          city: string | null
          company_name: string
          country: string | null
          created_at: string
          email: string | null
          iban: string | null
          id: string
          invoice_footer: string | null
          invoice_payment_days: number
          logo_url: string | null
          owner_name: string | null
          phone: string | null
          postal_code: string | null
          singleton: boolean
          street: string | null
          tax_id: string | null
          tax_number: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          bank_name?: string | null
          bic?: string | null
          city?: string | null
          company_name?: string
          country?: string | null
          created_at?: string
          email?: string | null
          iban?: string | null
          id?: string
          invoice_footer?: string | null
          invoice_payment_days?: number
          logo_url?: string | null
          owner_name?: string | null
          phone?: string | null
          postal_code?: string | null
          singleton?: boolean
          street?: string | null
          tax_id?: string | null
          tax_number?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          bank_name?: string | null
          bic?: string | null
          city?: string | null
          company_name?: string
          country?: string | null
          created_at?: string
          email?: string | null
          iban?: string | null
          id?: string
          invoice_footer?: string | null
          invoice_payment_days?: number
          logo_url?: string | null
          owner_name?: string | null
          phone?: string | null
          postal_code?: string | null
          singleton?: boolean
          street?: string | null
          tax_id?: string | null
          tax_number?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      course_templates: {
        Row: {
          course_type_id: string
          created_at: string
          day_of_week: number
          description: string | null
          direct_trainer_booking: boolean
          duration_minutes: number
          end_date: string | null
          id: string
          instructor_id: string | null
          is_active: boolean
          max_participants: number
          price: number
          start_time_of_day: string
          title: string
        }
        Insert: {
          course_type_id: string
          created_at?: string
          day_of_week: number
          description?: string | null
          direct_trainer_booking?: boolean
          duration_minutes?: number
          end_date?: string | null
          id?: string
          instructor_id?: string | null
          is_active?: boolean
          max_participants?: number
          price?: number
          start_time_of_day: string
          title: string
        }
        Update: {
          course_type_id?: string
          created_at?: string
          day_of_week?: number
          description?: string | null
          direct_trainer_booking?: boolean
          duration_minutes?: number
          end_date?: string | null
          id?: string
          instructor_id?: string | null
          is_active?: boolean
          max_participants?: number
          price?: number
          start_time_of_day?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_templates_course_type_id_fkey"
            columns: ["course_type_id"]
            isOneToOne: false
            referencedRelation: "course_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_templates_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "public_trainers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_templates_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      course_types: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          name: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
        }
        Relationships: []
      }
      courses: {
        Row: {
          booking_closes_at_start: boolean
          booking_opens_at: string | null
          booking_opens_immediately: boolean
          class_cards_allowed: boolean
          co_instructor_id: string | null
          color: string | null
          course_no: number | null
          course_type_id: string
          created_at: string
          description: string | null
          direct_trainer_booking: boolean
          end_time: string
          id: string
          image_url: string | null
          instructor_id: string | null
          internal_notes: string | null
          is_cancelled: boolean
          is_visible: boolean
          location: string | null
          max_participants: number
          min_participants: number | null
          price: number
          series_id: string | null
          start_time: string
          title: string
          updated_at: string
        }
        Insert: {
          booking_closes_at_start?: boolean
          booking_opens_at?: string | null
          booking_opens_immediately?: boolean
          class_cards_allowed?: boolean
          co_instructor_id?: string | null
          color?: string | null
          course_no?: number | null
          course_type_id: string
          created_at?: string
          description?: string | null
          direct_trainer_booking?: boolean
          end_time: string
          id?: string
          image_url?: string | null
          instructor_id?: string | null
          internal_notes?: string | null
          is_cancelled?: boolean
          is_visible?: boolean
          location?: string | null
          max_participants?: number
          min_participants?: number | null
          price?: number
          series_id?: string | null
          start_time: string
          title: string
          updated_at?: string
        }
        Update: {
          booking_closes_at_start?: boolean
          booking_opens_at?: string | null
          booking_opens_immediately?: boolean
          class_cards_allowed?: boolean
          co_instructor_id?: string | null
          color?: string | null
          course_no?: number | null
          course_type_id?: string
          created_at?: string
          description?: string | null
          direct_trainer_booking?: boolean
          end_time?: string
          id?: string
          image_url?: string | null
          instructor_id?: string | null
          internal_notes?: string | null
          is_cancelled?: boolean
          is_visible?: boolean
          location?: string | null
          max_participants?: number
          min_participants?: number | null
          price?: number
          series_id?: string | null
          start_time?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_course_type_id_fkey"
            columns: ["course_type_id"]
            isOneToOne: false
            referencedRelation: "course_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "public_trainers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          body_html: string | null
          created_at: string
          delivered_at: string | null
          error_message: string | null
          id: string
          metadata: Json
          recipient_email: string
          sent_at: string | null
          source: string
          status: string
          subject: string | null
          trigger_key: string | null
          updated_at: string
        }
        Insert: {
          body_html?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json
          recipient_email: string
          sent_at?: string | null
          source?: string
          status?: string
          subject?: string | null
          trigger_key?: string | null
          updated_at?: string
        }
        Update: {
          body_html?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json
          recipient_email?: string
          sent_at?: string | null
          source?: string
          status?: string
          subject?: string | null
          trigger_key?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      email_settings: {
        Row: {
          created_at: string
          domain: string | null
          from_email: string | null
          from_name: string | null
          id: string
          is_active: boolean
          reply_to: string | null
          smtp_host: string | null
          smtp_pass: string | null
          smtp_port: number | null
          smtp_secure: string
          smtp_user: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          domain?: string | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          is_active?: boolean
          reply_to?: string | null
          smtp_host?: string | null
          smtp_pass?: string | null
          smtp_port?: number | null
          smtp_secure?: string
          smtp_user?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          domain?: string | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          is_active?: boolean
          reply_to?: string | null
          smtp_host?: string | null
          smtp_pass?: string | null
          smtp_port?: number | null
          smtp_secure?: string
          smtp_user?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          body_html: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          subject: string
          trigger_key: string | null
          updated_at: string
        }
        Insert: {
          body_html: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          subject: string
          trigger_key?: string | null
          updated_at?: string
        }
        Update: {
          body_html?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          subject?: string
          trigger_key?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      newsletter_bounces: {
        Row: {
          bounce_type: string
          campaign_id: string | null
          created_at: string
          email: string
          id: string
          reason: string | null
        }
        Insert: {
          bounce_type: string
          campaign_id?: string | null
          created_at?: string
          email: string
          id?: string
          reason?: string | null
        }
        Update: {
          bounce_type?: string
          campaign_id?: string | null
          created_at?: string
          email?: string
          id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_bounces_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "newsletter_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_campaigns: {
        Row: {
          audience_filter: Json
          content_json: Json
          created_at: string
          created_by: string | null
          html_cached: string | null
          id: string
          preheader: string | null
          scheduled_at: string | null
          sent_at: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          audience_filter?: Json
          content_json?: Json
          created_at?: string
          created_by?: string | null
          html_cached?: string | null
          id?: string
          preheader?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          audience_filter?: Json
          content_json?: Json
          created_at?: string
          created_by?: string | null
          html_cached?: string | null
          id?: string
          preheader?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      newsletter_clicks: {
        Row: {
          clicked_at: string
          id: string
          ip: string | null
          link_id: string
          recipient_id: string
          user_agent: string | null
        }
        Insert: {
          clicked_at?: string
          id?: string
          ip?: string | null
          link_id: string
          recipient_id: string
          user_agent?: string | null
        }
        Update: {
          clicked_at?: string
          id?: string
          ip?: string | null
          link_id?: string
          recipient_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_clicks_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "newsletter_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "newsletter_clicks_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "newsletter_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_links: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          label: string | null
          url: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          label?: string | null
          url: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          label?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_links_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "newsletter_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_recipients: {
        Row: {
          campaign_id: string
          click_count: number
          created_at: string
          email: string
          error: string | null
          id: string
          last_clicked_at: string | null
          open_count: number
          opened_at: string | null
          sent_at: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          campaign_id: string
          click_count?: number
          created_at?: string
          email: string
          error?: string | null
          id?: string
          last_clicked_at?: string | null
          open_count?: number
          opened_at?: string | null
          sent_at?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          campaign_id?: string
          click_count?: number
          created_at?: string
          email?: string
          error?: string | null
          id?: string
          last_clicked_at?: string | null
          open_count?: number
          opened_at?: string | null
          sent_at?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "newsletter_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_settings: {
        Row: {
          created_at: string
          footer_address: string | null
          footer_text: string | null
          from_email: string | null
          from_name: string | null
          id: string
          rate_per_minute: number
          reply_to: string | null
          smtp_host: string | null
          smtp_pass: string | null
          smtp_port: number | null
          smtp_secure: string
          smtp_user: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          footer_address?: string | null
          footer_text?: string | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          rate_per_minute?: number
          reply_to?: string | null
          smtp_host?: string | null
          smtp_pass?: string | null
          smtp_port?: number | null
          smtp_secure?: string
          smtp_user?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          footer_address?: string | null
          footer_text?: string | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          rate_per_minute?: number
          reply_to?: string | null
          smtp_host?: string | null
          smtp_pass?: string | null
          smtp_port?: number | null
          smtp_secure?: string
          smtp_user?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      newsletter_suppressions: {
        Row: {
          created_at: string
          email: string
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          reason?: string
        }
        Relationships: []
      }
      newsletter_templates: {
        Row: {
          content_json: Json
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          content_json?: Json
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          content_json?: Json
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      newsletter_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          token: string
        }
        Insert: {
          created_at?: string
          email: string
          token: string
        }
        Update: {
          created_at?: string
          email?: string
          token?: string
        }
        Relationships: []
      }
      number_sequences: {
        Row: {
          last_value: number
          scope: string
          year: number
        }
        Insert: {
          last_value?: number
          scope: string
          year: number
        }
        Update: {
          last_value?: number
          scope?: string
          year?: number
        }
        Relationships: []
      }
      order_items: {
        Row: {
          course_id: string | null
          created_at: string
          description: string | null
          id: string
          item_type: Database["public"]["Enums"]["order_item_type"]
          line_total: number
          name: string
          order_id: string
          product_id: string | null
          quantity: number
          tax_rate: number
          unit_price: number
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          item_type: Database["public"]["Enums"]["order_item_type"]
          line_total?: number
          name: string
          order_id: string
          product_id?: string | null
          quantity?: number
          tax_rate?: number
          unit_price?: number
        }
        Update: {
          course_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          item_type?: Database["public"]["Enums"]["order_item_type"]
          line_total?: number
          name?: string
          order_id?: string
          product_id?: string | null
          quantity?: number
          tax_rate?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          billing_city: string | null
          billing_country: string | null
          billing_email: string | null
          billing_first_name: string | null
          billing_last_name: string | null
          billing_phone: string | null
          billing_postal_code: string | null
          billing_street: string | null
          card_assignments: Json | null
          created_at: string
          discount_amount: number
          id: string
          invoice_issued_at: string | null
          invoice_number: string | null
          invoice_pdf_path: string | null
          notes: string | null
          order_number: string | null
          paid_at: string | null
          payment_id: string | null
          payment_method: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tax_total: number
          total: number
          updated_at: string
          user_id: string
          voucher_code: string | null
          voucher_id: string | null
        }
        Insert: {
          billing_city?: string | null
          billing_country?: string | null
          billing_email?: string | null
          billing_first_name?: string | null
          billing_last_name?: string | null
          billing_phone?: string | null
          billing_postal_code?: string | null
          billing_street?: string | null
          card_assignments?: Json | null
          created_at?: string
          discount_amount?: number
          id?: string
          invoice_issued_at?: string | null
          invoice_number?: string | null
          invoice_pdf_path?: string | null
          notes?: string | null
          order_number?: string | null
          paid_at?: string | null
          payment_id?: string | null
          payment_method?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string
          user_id: string
          voucher_code?: string | null
          voucher_id?: string | null
        }
        Update: {
          billing_city?: string | null
          billing_country?: string | null
          billing_email?: string | null
          billing_first_name?: string | null
          billing_last_name?: string | null
          billing_phone?: string | null
          billing_postal_code?: string | null
          billing_street?: string | null
          card_assignments?: Json | null
          created_at?: string
          discount_amount?: number
          id?: string
          invoice_issued_at?: string | null
          invoice_number?: string | null
          invoice_pdf_path?: string | null
          notes?: string | null
          order_number?: string | null
          paid_at?: string | null
          payment_id?: string | null
          payment_method?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string
          user_id?: string
          voucher_code?: string | null
          voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_settings: {
        Row: {
          client_id: string | null
          client_secret: string | null
          created_at: string
          id: string
          is_active: boolean
          mode: string
          provider: string
          updated_at: string
          webhook_id: string | null
        }
        Insert: {
          client_id?: string | null
          client_secret?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          mode?: string
          provider: string
          updated_at?: string
          webhook_id?: string | null
        }
        Update: {
          client_id?: string | null
          client_secret?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          mode?: string
          provider?: string
          updated_at?: string
          webhook_id?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          card_credits: number | null
          card_validity_days: number | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          kind: Database["public"]["Enums"]["product_kind"]
          name: string
          price: number
          sku: string | null
          sort_order: number
          stock: number | null
          tax_rate: number
          updated_at: string
        }
        Insert: {
          card_credits?: number | null
          card_validity_days?: number | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          kind?: Database["public"]["Enums"]["product_kind"]
          name: string
          price?: number
          sku?: string | null
          sort_order?: number
          stock?: number | null
          tax_rate?: number
          updated_at?: string
        }
        Update: {
          card_credits?: number | null
          card_validity_days?: number | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          kind?: Database["public"]["Enums"]["product_kind"]
          name?: string
          price?: number
          sku?: string | null
          sort_order?: number
          stock?: number | null
          tax_rate?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          birthday: string | null
          city: string | null
          country: string | null
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          is_guest: boolean
          last_name: string | null
          newsletter_opt_in: boolean
          phone: string | null
          postal_code: string | null
          street: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          birthday?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          is_guest?: boolean
          last_name?: string | null
          newsletter_opt_in?: boolean
          phone?: string | null
          postal_code?: string | null
          street?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          birthday?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          is_guest?: boolean
          last_name?: string | null
          newsletter_opt_in?: boolean
          phone?: string | null
          postal_code?: string | null
          street?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      trainer_compensation_tiers: {
        Row: {
          amount: number
          course_type_id: string
          created_at: string
          id: string
          max_participants: number
          min_participants: number
          trainer_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          course_type_id: string
          created_at?: string
          id?: string
          max_participants?: number
          min_participants?: number
          trainer_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          course_type_id?: string
          created_at?: string
          id?: string
          max_participants?: number
          min_participants?: number
          trainer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainer_compensation_tiers_course_type_id_fkey"
            columns: ["course_type_id"]
            isOneToOne: false
            referencedRelation: "course_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_compensation_tiers_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "public_trainers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_compensation_tiers_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      trainer_earnings: {
        Row: {
          amount: number
          course_date: string
          course_id: string
          created_at: string
          id: string
          participants_count: number
          payout_id: string | null
          status: string
          tier_id: string | null
          trainer_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          course_date: string
          course_id: string
          created_at?: string
          id?: string
          participants_count?: number
          payout_id?: string | null
          status?: string
          tier_id?: string | null
          trainer_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          course_date?: string
          course_id?: string
          created_at?: string
          id?: string
          participants_count?: number
          payout_id?: string | null
          status?: string
          tier_id?: string | null
          trainer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainer_earnings_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_earnings_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "trainer_payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_earnings_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "trainer_compensation_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_earnings_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "public_trainers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_earnings_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      trainer_payouts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          note: string | null
          payout_number: string | null
          pdf_path: string | null
          period_end: string
          period_start: string
          requested_at: string
          status: string
          subtotal: number
          total: number
          trainer_id: string
          trainer_snapshot: Json | null
          updated_at: string
          vat_amount: number
          vat_rate: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          payout_number?: string | null
          pdf_path?: string | null
          period_end: string
          period_start: string
          requested_at?: string
          status?: string
          subtotal?: number
          total?: number
          trainer_id: string
          trainer_snapshot?: Json | null
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          payout_number?: string | null
          pdf_path?: string | null
          period_end?: string
          period_start?: string
          requested_at?: string
          status?: string
          subtotal?: number
          total?: number
          trainer_id?: string
          trainer_snapshot?: Json | null
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "trainer_payouts_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "public_trainers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_payouts_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      trainers: {
        Row: {
          bank_name: string | null
          bic: string | null
          bio: string | null
          city: string | null
          country: string | null
          created_at: string
          email: string | null
          first_name: string
          iban: string | null
          id: string
          invited_at: string | null
          is_active: boolean
          is_small_business: boolean
          last_name: string
          onboarded_at: string | null
          onboarding_dismissed: boolean
          phone: string | null
          postal_code: string | null
          street: string | null
          tax_id: string | null
          tax_number: string | null
          user_id: string | null
        }
        Insert: {
          bank_name?: string | null
          bic?: string | null
          bio?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          first_name: string
          iban?: string | null
          id?: string
          invited_at?: string | null
          is_active?: boolean
          is_small_business?: boolean
          last_name: string
          onboarded_at?: string | null
          onboarding_dismissed?: boolean
          phone?: string | null
          postal_code?: string | null
          street?: string | null
          tax_id?: string | null
          tax_number?: string | null
          user_id?: string | null
        }
        Update: {
          bank_name?: string | null
          bic?: string | null
          bio?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          first_name?: string
          iban?: string | null
          id?: string
          invited_at?: string | null
          is_active?: boolean
          is_small_business?: boolean
          last_name?: string
          onboarded_at?: string | null
          onboarding_dismissed?: boolean
          phone?: string | null
          postal_code?: string | null
          street?: string | null
          tax_id?: string | null
          tax_number?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      video_course_access: {
        Row: {
          access_type: Database["public"]["Enums"]["video_access_model"]
          cancelled_at: string | null
          course_id: string
          created_at: string
          current_period_end: string | null
          grace_until: string | null
          id: string
          last_payment_at: string | null
          order_id: string | null
          paypal_order_id: string | null
          paypal_subscription_id: string | null
          status: Database["public"]["Enums"]["video_access_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          access_type: Database["public"]["Enums"]["video_access_model"]
          cancelled_at?: string | null
          course_id: string
          created_at?: string
          current_period_end?: string | null
          grace_until?: string | null
          id?: string
          last_payment_at?: string | null
          order_id?: string | null
          paypal_order_id?: string | null
          paypal_subscription_id?: string | null
          status?: Database["public"]["Enums"]["video_access_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          access_type?: Database["public"]["Enums"]["video_access_model"]
          cancelled_at?: string | null
          course_id?: string
          created_at?: string
          current_period_end?: string | null
          grace_until?: string | null
          id?: string
          last_payment_at?: string | null
          order_id?: string | null
          paypal_order_id?: string | null
          paypal_subscription_id?: string | null
          status?: Database["public"]["Enums"]["video_access_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_course_access_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "video_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_course_access_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      video_course_payments: {
        Row: {
          access_id: string | null
          amount: number | null
          course_id: string
          created_at: string
          currency: string | null
          event_type: Database["public"]["Enums"]["video_payment_event"]
          id: string
          paid_at: string
          provider_event_id: string | null
          raw_payload: Json | null
          user_id: string
        }
        Insert: {
          access_id?: string | null
          amount?: number | null
          course_id: string
          created_at?: string
          currency?: string | null
          event_type: Database["public"]["Enums"]["video_payment_event"]
          id?: string
          paid_at?: string
          provider_event_id?: string | null
          raw_payload?: Json | null
          user_id: string
        }
        Update: {
          access_id?: string | null
          amount?: number | null
          course_id?: string
          created_at?: string
          currency?: string | null
          event_type?: Database["public"]["Enums"]["video_payment_event"]
          id?: string
          paid_at?: string
          provider_event_id?: string | null
          raw_payload?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_course_payments_access_id_fkey"
            columns: ["access_id"]
            isOneToOne: false
            referencedRelation: "video_course_access"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_course_payments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "video_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      video_course_voucher_plans: {
        Row: {
          course_id: string
          created_at: string
          discount_percent: number
          id: string
          interval_unit: string
          paypal_plan_id: string
          voucher_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          discount_percent: number
          id?: string
          interval_unit: string
          paypal_plan_id: string
          voucher_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          discount_percent?: number
          id?: string
          interval_unit?: string
          paypal_plan_id?: string
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_course_voucher_plans_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "video_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_course_voucher_plans_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      video_courses: {
        Row: {
          access_model: Database["public"]["Enums"]["video_access_model"]
          cover_image_url: string | null
          created_at: string
          description: string | null
          grace_days: number
          id: string
          is_published: boolean
          paypal_plan_monthly_id: string | null
          paypal_plan_yearly_id: string | null
          paypal_product_id: string | null
          price_monthly: number | null
          price_once: number | null
          price_yearly: number | null
          slug: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          access_model?: Database["public"]["Enums"]["video_access_model"]
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          grace_days?: number
          id?: string
          is_published?: boolean
          paypal_plan_monthly_id?: string | null
          paypal_plan_yearly_id?: string | null
          paypal_product_id?: string | null
          price_monthly?: number | null
          price_once?: number | null
          price_yearly?: number | null
          slug: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          access_model?: Database["public"]["Enums"]["video_access_model"]
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          grace_days?: number
          id?: string
          is_published?: boolean
          paypal_plan_monthly_id?: string | null
          paypal_plan_yearly_id?: string | null
          paypal_product_id?: string | null
          price_monthly?: number | null
          price_once?: number | null
          price_yearly?: number | null
          slug?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      video_lesson_progress: {
        Row: {
          completed_at: string | null
          id: string
          lesson_id: string
          seconds_watched: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          id?: string
          lesson_id: string
          seconds_watched?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          lesson_id?: string
          seconds_watched?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "video_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "video_lessons_public"
            referencedColumns: ["id"]
          },
        ]
      }
      video_lessons: {
        Row: {
          course_id: string
          created_at: string
          description: string | null
          duration_seconds: number | null
          id: string
          is_free_preview: boolean
          provider: Database["public"]["Enums"]["video_provider"]
          sort_order: number
          title: string
          updated_at: string
          video_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          id?: string
          is_free_preview?: boolean
          provider?: Database["public"]["Enums"]["video_provider"]
          sort_order?: number
          title: string
          updated_at?: string
          video_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          id?: string
          is_free_preview?: boolean
          provider?: Database["public"]["Enums"]["video_provider"]
          sort_order?: number
          title?: string
          updated_at?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "video_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_redemptions: {
        Row: {
          booking_id: string | null
          discount_amount: number
          id: string
          order_id: string | null
          redeemed_at: string
          user_id: string
          voucher_id: string
        }
        Insert: {
          booking_id?: string | null
          discount_amount?: number
          id?: string
          order_id?: string | null
          redeemed_at?: string
          user_id: string
          voucher_id: string
        }
        Update: {
          booking_id?: string | null
          discount_amount?: number
          id?: string
          order_id?: string | null
          redeemed_at?: string
          user_id?: string
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_redemptions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_redemptions_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      vouchers: {
        Row: {
          applies_to: string[]
          class_card_types: string[]
          code: string
          course_type_ids: string[]
          created_at: string
          created_by: string | null
          description: string | null
          discount_amount_fixed: number | null
          discount_percent: number
          id: string
          is_active: boolean
          is_single_use: boolean
          max_total_uses: number | null
          max_uses_per_customer: number | null
          product_ids: string[]
          times_used: number
          updated_at: string
          valid_from: string | null
          valid_until: string | null
          video_course_ids: string[]
        }
        Insert: {
          applies_to?: string[]
          class_card_types?: string[]
          code: string
          course_type_ids?: string[]
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_amount_fixed?: number | null
          discount_percent?: number
          id?: string
          is_active?: boolean
          is_single_use?: boolean
          max_total_uses?: number | null
          max_uses_per_customer?: number | null
          product_ids?: string[]
          times_used?: number
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
          video_course_ids?: string[]
        }
        Update: {
          applies_to?: string[]
          class_card_types?: string[]
          code?: string
          course_type_ids?: string[]
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_amount_fixed?: number | null
          discount_percent?: number
          id?: string
          is_active?: boolean
          is_single_use?: boolean
          max_total_uses?: number | null
          max_uses_per_customer?: number | null
          product_ids?: string[]
          times_used?: number
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
          video_course_ids?: string[]
        }
        Relationships: []
      }
    }
    Views: {
      public_trainers: {
        Row: {
          first_name: string | null
          id: string | null
          last_name: string | null
        }
        Insert: {
          first_name?: string | null
          id?: string | null
          last_name?: string | null
        }
        Update: {
          first_name?: string | null
          id?: string | null
          last_name?: string | null
        }
        Relationships: []
      }
      video_lessons_public: {
        Row: {
          course_id: string | null
          created_at: string | null
          description: string | null
          duration_seconds: number | null
          id: string | null
          is_free_preview: boolean | null
          provider: Database["public"]["Enums"]["video_provider"] | null
          sort_order: number | null
          title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "video_courses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      consume_class_card_credit: { Args: { _card_id: string }; Returns: number }
      current_trainer_id: { Args: never; Returns: string }
      get_course_participant_count: {
        Args: { course_uuid: string }
        Returns: number
      }
      get_course_participant_counts: {
        Args: { _course_ids: string[] }
        Returns: {
          course_id: string
          participants_count: number
        }[]
      }
      has_active_video_access: {
        Args: { _course_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_my_course: { Args: { _course_id: string }; Returns: boolean }
      mark_order_paid: { Args: { _order_id: string }; Returns: Json }
      next_number: { Args: { _scope: string }; Returns: string }
      refund_class_card_credit: { Args: { _card_id: string }; Returns: number }
      set_my_onboarding_dismissed: {
        Args: { _dismissed: boolean }
        Returns: undefined
      }
      trainer_login_status: {
        Args: never
        Returns: {
          last_sign_in_at: string
          trainer_id: string
        }[]
      }
      user_has_course_booking: {
        Args: { _course_id: string; _user_id: string }
        Returns: boolean
      }
      validate_voucher: {
        Args: {
          _card_types?: string[]
          _cart_total?: number
          _code: string
          _course_type_ids?: string[]
          _product_ids?: string[]
        }
        Returns: Json
      }
      validate_voucher_cart: {
        Args: { _cart: Json; _code: string }
        Returns: Json
      }
      zz_migration_export: {
        Args: { part: string; token: string }
        Returns: Json
      }
      zz_migration_schema: { Args: { token: string }; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "staff" | "customer" | "trainer"
      booking_status:
        | "confirmed"
        | "cancelled"
        | "waitlisted"
        | "pending_payment"
      card_type: "five" | "ten"
      order_item_type: "product" | "course_booking" | "class_card"
      order_status: "pending" | "paid" | "cancelled" | "refunded"
      payment_method:
        | "paypal"
        | "klarna"
        | "card_credit"
        | "simulated_paypal"
        | "simulated_card"
        | "admin_grant"
        | "invoice"
        | "voucher"
      product_kind: "physical" | "digital" | "class_card" | "voucher"
      video_access_model: "one_time" | "subscription"
      video_access_status:
        | "active"
        | "grace"
        | "cancelled"
        | "expired"
        | "pending_payment"
      video_payment_event: "initial" | "renewal" | "failed" | "refund"
      video_provider: "vimeo" | "youtube"
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
      app_role: ["admin", "staff", "customer", "trainer"],
      booking_status: [
        "confirmed",
        "cancelled",
        "waitlisted",
        "pending_payment",
      ],
      card_type: ["five", "ten"],
      order_item_type: ["product", "course_booking", "class_card"],
      order_status: ["pending", "paid", "cancelled", "refunded"],
      payment_method: [
        "paypal",
        "klarna",
        "card_credit",
        "simulated_paypal",
        "simulated_card",
        "admin_grant",
        "invoice",
        "voucher",
      ],
      product_kind: ["physical", "digital", "class_card", "voucher"],
      video_access_model: ["one_time", "subscription"],
      video_access_status: [
        "active",
        "grace",
        "cancelled",
        "expired",
        "pending_payment",
      ],
      video_payment_event: ["initial", "renewal", "failed", "refund"],
      video_provider: ["vimeo", "youtube"],
    },
  },
} as const
