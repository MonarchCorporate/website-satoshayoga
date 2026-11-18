// Helper zum Auslösen von Kunden-E-Mails aus Frontend/Edge-Code.
import { supabase } from "@/integrations/supabase/client";

export async function sendCustomerEmail(params: {
  trigger_key: string;
  recipient_email: string;
  data?: Record<string, unknown>;
  idempotency_key?: string;
}) {
  try {
    const { error } = await supabase.functions.invoke("send-customer-email", {
      body: params,
    });
    if (error) console.warn("[email] send failed", params.trigger_key, error);
  } catch (e) {
    console.warn("[email] send threw", params.trigger_key, e);
  }
}
