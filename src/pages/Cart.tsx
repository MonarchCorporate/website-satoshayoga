import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Trash2, ShoppingBag, Ticket, X } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";

interface CartItem {
  id: string;
  course_id: string | null;
  product_id: string | null;
  card_type: string | null;
  courses?: { title: string; start_time: string; price: number } | null;
  products?: {
    name: string;
    price: number;
    tax_rate: number;
    image_url: string | null;
    kind: string;
  } | null;
}

type AppliedVoucher = {
  voucher_id: string;
  code: string;
  discount_percent: number;
  discount_amount: number;
  applicable_amount: number;
};

const VOUCHER_KEY = "appliedVoucher";

export default function Cart() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [voucher, setVoucher] = useState<AppliedVoucher | null>(null);
  const [validating, setValidating] = useState(false);

  const fetchCart = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("cart_items")
      .select(
        "id, course_id, product_id, card_type, courses(title, start_time, price, direct_trainer_booking), products(name, price, tax_rate, image_url, kind)"
      )
      .eq("user_id", user.id);
    const blocked = ((data as any[]) ?? []).filter((i) => i.courses?.direct_trainer_booking);
    if (blocked.length) {
      await supabase.from("cart_items").delete().in("id", blocked.map((i) => i.id));
      toast.info(`${blocked.map((i) => i.courses.title).join(", ")}: nur direkt bei Trainer:in buchbar – aus dem Warenkorb entfernt.`);
    }
    setItems(((data as any[]) ?? []).filter((i) => !i.courses?.direct_trainer_booking));
    setLoading(false);
  };

  useEffect(() => {
    fetchCart();
    try {
      const raw = localStorage.getItem(VOUCHER_KEY);
      if (raw) setVoucher(JSON.parse(raw));
    } catch {}
  }, [user]);

  const removeItem = async (id: string) => {
    await supabase.from("cart_items").delete().eq("id", id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    toast.success("Entfernt.");
  };

  const getItemPrice = (item: CartItem) => {
    if (item.products) return Number(item.products.price);
    if (item.courses) return Number(item.courses.price);
    if (item.card_type === "five") return 70;
    if (item.card_type === "ten") return 120;
    return 0;
  };

  const total = items.reduce((sum, item) => sum + getItemPrice(item), 0);

  const buildCartPayload = () =>
    items.map((it) => {
      if (it.products) {
        const isCard = it.products.kind === "class_card";
        return {
          type: isCard ? "card" : "product",
          ref_id: it.product_id,
          amount: Number(it.products.price),
        };
      }
      if (it.courses) {
        return { type: "course", ref_id: it.course_id, amount: Number(it.courses.price) };
      }
      return {
        type: "card",
        ref_id: it.card_type,
        amount: it.card_type === "five" ? 70 : 120,
      };
    });

  const applyVoucher = async () => {
    if (!code.trim()) return;
    setValidating(true);
    const { data, error } = await (supabase as any).rpc("validate_voucher_cart", {
      _code: code.trim(),
      _cart: buildCartPayload(),
    });
    setValidating(false);
    if (error) {
      toast.error("Fehler: " + error.message);
      return;
    }
    const r = data as any;
    if (!r?.ok) {
      toast.error(r?.error ?? "Code ungültig.");
      return;
    }
    const av: AppliedVoucher = {
      voucher_id: r.voucher_id,
      code: r.code,
      discount_percent: Number(r.discount_percent),
      discount_amount: Number(r.discount_amount),
      applicable_amount: Number(r.applicable_amount),
    };
    setVoucher(av);
    localStorage.setItem(VOUCHER_KEY, JSON.stringify(av));
    setCode("");
    toast.success(`Gutschein „${av.code}" eingelöst – ${av.discount_amount.toFixed(2)} € Rabatt.`);
  };

  const removeVoucher = () => {
    setVoucher(null);
    localStorage.removeItem(VOUCHER_KEY);
  };

  const discount = voucher ? Math.min(voucher.discount_amount, total) : 0;
  const finalTotal = Math.max(0, total - discount);

  if (!user) {
    return (
      <div className="container py-12 text-center">
        <p className="text-muted-foreground">
          Bitte melde dich an, um deinen Warenkorb zu sehen.
        </p>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-8">
      <h1 className="font-display text-4xl font-semibold mb-6 text-center">
        Warenkorb
      </h1>

      {loading ? (
        <p className="text-center text-muted-foreground">Laden…</p>
      ) : items.length === 0 ? (
        <div className="text-center py-12 space-y-4">
          <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">Dein Warenkorb ist leer.</p>
          <Button asChild>
            <Link to="/shop">Zum Shop</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <Card key={item.id} className="animate-fade-in">
              <CardContent className="flex items-center justify-between p-4 gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {item.products?.image_url && (
                    <img
                      src={item.products.image_url}
                      alt=""
                      className="h-14 w-14 rounded object-cover flex-shrink-0"
                    />
                  )}
                  <div className="min-w-0">
                    {item.courses ? (
                      <>
                        <p className="font-medium truncate">
                          {item.courses.title}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {format(
                            parseISO(item.courses.start_time),
                            "EEEE, d. MMM · HH:mm",
                            { locale: de }
                          )}
                        </p>
                      </>
                    ) : item.products ? (
                      <p className="font-medium truncate">{item.products.name}</p>
                    ) : (
                      <p className="font-medium">
                        {item.card_type === "five" ? "5er-Karte" : "10er-Karte"}
                      </p>
                    )}
                    <p className="text-sm font-semibold text-primary mt-1">
                      {getItemPrice(item).toFixed(2)} €
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeItem(item.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          ))}

          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Ticket className="h-4 w-4 text-primary" />
                Gutscheincode
              </div>
              {voucher ? (
                <div className="flex items-center justify-between rounded-md border border-primary/40 bg-primary/5 p-3">
                  <div className="text-sm">
                    <p className="font-mono font-semibold">{voucher.code}</p>
                    <p className="text-xs text-muted-foreground">
                      {voucher.discount_percent}% Rabatt · −
                      {voucher.discount_amount.toFixed(2)} €
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={removeVoucher}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    placeholder="Code eingeben"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="font-mono"
                  />
                  <Button onClick={applyVoucher} disabled={validating || !code.trim()}>
                    {validating ? "Prüfen…" : "Einlösen"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="border-t pt-4 space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span>Zwischensumme</span>
              <span>{total.toFixed(2)} €</span>
            </div>
            {discount > 0 && (
              <div className="flex items-center justify-between text-primary">
                <span>Rabatt ({voucher?.code})</span>
                <span>−{discount.toFixed(2)} €</span>
              </div>
            )}
            <div className="flex items-center justify-between text-lg font-semibold pt-2">
              <span>Gesamt:</span>
              <span className="text-primary">{finalTotal.toFixed(2)} €</span>
            </div>
            <p className="text-xs text-muted-foreground pt-2">
              Gemäß § 19 UStG (Kleinunternehmerregelung) wird keine Umsatzsteuer ausgewiesen.
            </p>
          </div>

          <Button
            className="w-full"
            size="lg"
            onClick={() => navigate("/checkout")}
          >
            Zur Kasse
          </Button>
        </div>
      )}
    </div>
  );
}
