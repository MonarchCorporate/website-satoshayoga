import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { XCircle } from "lucide-react";

export default function CheckoutCancel() {
  return (
    <div className="container max-w-xl py-16">
      <Card>
        <CardContent className="text-center py-12 space-y-4">
          <XCircle className="h-12 w-12 mx-auto text-muted-foreground" />
          <h2 className="font-display text-2xl">Zahlung abgebrochen</h2>
          <p className="text-muted-foreground text-sm">
            Du hast die PayPal-Zahlung abgebrochen. Es wurde nichts berechnet.
          </p>
          <div className="flex justify-center gap-2 pt-2">
            <Button asChild>
              <Link to="/checkout">Zurück zur Kasse</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/cart">Warenkorb</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
