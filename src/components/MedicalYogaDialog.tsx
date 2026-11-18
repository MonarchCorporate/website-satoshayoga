import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Heart } from "lucide-react";
import { toast } from "sonner";

export default function MedicalYogaDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // For now, just show success - later this can send an email via edge function
    await new Promise((r) => setTimeout(r, 500));
    toast.success("Deine Anfrage wurde gesendet! Wir melden uns bei dir.");
    setOpen(false);
    setName("");
    setEmail("");
    setMessage("");
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg">
          <Heart className="mr-2 h-5 w-5" />
          Medical Yoga anfragen
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Medical Yoga Anfrage</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground mb-4">
          Medical Yoga ist eine individuelle Yoga-Therapie. Schreib uns eine Nachricht und wir melden uns bei dir.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="med-name">Name</Label>
            <Input id="med-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="med-email">E-Mail</Label>
            <Input id="med-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="med-message">Nachricht</Label>
            <Textarea id="med-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder="Beschreibe kurz dein Anliegen…" required />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Wird gesendet…" : "Anfrage senden"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
