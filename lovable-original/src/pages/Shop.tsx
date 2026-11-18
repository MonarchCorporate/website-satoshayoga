import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { ShoppingCart } from "lucide-react";

type Product = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  kind: "physical" | "digital" | "class_card" | "voucher";
  price: number;
  stock: number | null;
  card_credits: number | null;
};

type Course = {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  price: number;
  max_participants: number;
  is_cancelled: boolean;
};

export default function Shop() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [prodRes, courseRes] = await Promise.all([
        supabase
          .from("products")
          .select("*")
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("courses")
          .select("*")
          .eq("is_cancelled", false)
          .gte("start_time", new Date().toISOString())
          .order("start_time"),
      ]);
      setProducts((prodRes.data as Product[]) ?? []);
      setCourses((courseRes.data as Course[]) ?? []);
      setLoading(false);
    };
    load();
  }, []);

  const addProduct = async (productId: string) => {
    if (!user) {
      toast.error("Bitte melde dich zuerst an.");
      navigate("/auth");
      return;
    }
    const { error } = await supabase.from("cart_items").insert({
      user_id: user.id,
      product_id: productId,
    });
    if (error) toast.error("Fehler beim Hinzufügen.");
    else toast.success("Zum Warenkorb hinzugefügt!");
  };

  const addCourse = async (courseId: string) => {
    if (!user) {
      toast.error("Bitte melde dich zuerst an.");
      navigate("/auth");
      return;
    }
    const { error } = await supabase.from("cart_items").insert({
      user_id: user.id,
      course_id: courseId,
    });
    if (error) toast.error("Fehler beim Hinzufügen.");
    else toast.success("Kurs zum Warenkorb hinzugefügt!");
  };

  const cards = products.filter((p) => p.kind === "class_card");
  const otherProducts = products.filter((p) => p.kind !== "class_card");

  return (
    <div className="container py-8">
      <div className="mb-8 text-center">
        <h1 className="font-display text-4xl font-semibold mb-2">Shop</h1>
        <p className="text-muted-foreground">
          Karten, Kurse & Produkte – alles an einem Ort
        </p>
      </div>

      <Tabs defaultValue="cards" className="max-w-5xl mx-auto">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="cards">Gruppenkarten</TabsTrigger>
          <TabsTrigger value="courses">Kurse</TabsTrigger>
          <TabsTrigger value="products">Produkte</TabsTrigger>
        </TabsList>

        <TabsContent value="cards">
          {loading ? (
            <p className="text-center text-muted-foreground">Laden…</p>
          ) : cards.length === 0 ? (
            <p className="text-center text-muted-foreground">
              Keine Karten verfügbar.
            </p>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {cards.map((p) => (
                <Card key={p.id} className="relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-primary" />
                  <CardHeader>
                    <CardTitle className="font-display text-2xl">
                      {p.name}
                    </CardTitle>
                    <CardDescription>{p.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-3xl font-display font-semibold text-primary">
                      {Number(p.price).toFixed(2)} €
                    </p>
                    {p.card_credits && (
                      <p className="text-sm text-muted-foreground">
                        {(Number(p.price) / p.card_credits).toFixed(2)} € pro
                        Stunde
                      </p>
                    )}
                    <Button className="w-full" onClick={() => addProduct(p.id)}>
                      <ShoppingCart className="h-4 w-4 mr-2" />
                      In den Warenkorb
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="courses">
          {loading ? (
            <p className="text-center text-muted-foreground">Laden…</p>
          ) : courses.length === 0 ? (
            <p className="text-center text-muted-foreground">
              Aktuell keine Kurse buchbar.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {courses.map((c) => (
                <Card key={c.id}>
                  <CardHeader>
                    <CardTitle className="font-display text-xl">
                      {c.title}
                    </CardTitle>
                    <CardDescription>
                      {format(parseISO(c.start_time), "EEEE, d. MMM · HH:mm", {
                        locale: de,
                      })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between">
                    <span className="text-2xl font-display font-semibold text-primary">
                      {Number(c.price).toFixed(2)} €
                    </span>
                    <Button onClick={() => addCourse(c.id)}>
                      <ShoppingCart className="h-4 w-4 mr-2" />
                      Buchen
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="products">
          {loading ? (
            <p className="text-center text-muted-foreground">Laden…</p>
          ) : otherProducts.length === 0 ? (
            <p className="text-center text-muted-foreground">
              Aktuell keine weiteren Produkte verfügbar.
            </p>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
              {otherProducts.map((p) => (
                <Card key={p.id} className="overflow-hidden">
                  {p.image_url && (
                    <img
                      src={p.image_url}
                      alt={p.name}
                      className="aspect-square w-full object-cover"
                    />
                  )}
                  <CardHeader>
                    <CardTitle className="font-display text-xl">
                      {p.name}
                    </CardTitle>
                    <CardDescription className="line-clamp-2">
                      {p.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xl font-display font-semibold text-primary">
                        {Number(p.price).toFixed(2)} €
                      </span>
                      {p.stock !== null && p.stock <= 5 && (
                        <Badge variant="outline">
                          Nur noch {p.stock} verfügbar
                        </Badge>
                      )}
                    </div>
                    <Button
                      className="w-full"
                      disabled={p.stock !== null && p.stock <= 0}
                      onClick={() => addProduct(p.id)}
                    >
                      <ShoppingCart className="h-4 w-4 mr-2" />
                      {p.stock !== null && p.stock <= 0
                        ? "Ausverkauft"
                        : "In den Warenkorb"}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
