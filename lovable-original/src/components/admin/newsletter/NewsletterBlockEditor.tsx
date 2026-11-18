import { useState } from "react";
import { DndContext, closestCenter, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Heading1, Type, Image as ImageIcon, MousePointerClick, Minus, Square, Columns2, GripVertical, Trash2, Copy } from "lucide-react";
import type { Block } from "./types";
import { newBlock } from "./types";
import { renderPreview } from "./preview";

const PALETTE: { type: Block["type"]; label: string; icon: any }[] = [
  { type: "heading", label: "Überschrift", icon: Heading1 },
  { type: "text", label: "Text", icon: Type },
  { type: "image", label: "Bild", icon: ImageIcon },
  { type: "button", label: "Button", icon: MousePointerClick },
  { type: "spacer", label: "Abstand", icon: Square },
  { type: "divider", label: "Trennlinie", icon: Minus },
  { type: "columns", label: "2 Spalten", icon: Columns2 },
];

function SortableItem({
  block, selected, onSelect, onDelete, onDuplicate,
}: { block: Block; selected: boolean; onSelect: () => void; onDelete: () => void; onDuplicate: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const summary =
    block.type === "heading" ? block.text :
    block.type === "text" ? block.html.replace(/<[^>]+>/g, "").slice(0, 60) :
    block.type === "button" ? `Button: ${block.text}` :
    block.type === "image" ? `Bild: ${block.src || "(kein Bild)"}` :
    block.type === "spacer" ? `Abstand ${block.height ?? 24}px` :
    block.type === "divider" ? "Trennlinie" :
    "2 Spalten";
  return (
    <div ref={setNodeRef} style={style}
         className={`flex items-center gap-2 rounded border p-2 cursor-pointer ${selected ? "border-primary bg-primary/5" : "border-border bg-card"}`}
         onClick={onSelect}>
      <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground" onClick={(e) => e.stopPropagation()}>
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex-1 truncate text-sm">{summary || `(${block.type})`}</span>
      <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); onDuplicate(); }}><Copy className="h-3.5 w-3.5" /></Button>
      <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); onDelete(); }}><Trash2 className="h-3.5 w-3.5" /></Button>
    </div>
  );
}

export function NewsletterBlockEditor({ value, onChange }: { value: Block[]; onChange: (b: Block[]) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const selected = value.find((b) => b.id === selectedId) ?? null;

  const update = (id: string, patch: Partial<Block>) => {
    onChange(value.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)));
  };
  const add = (type: Block["type"]) => {
    const b = newBlock(type);
    onChange([...value, b]);
    setSelectedId(b.id);
  };
  const remove = (id: string) => onChange(value.filter((b) => b.id !== id));
  const duplicate = (id: string) => {
    const idx = value.findIndex((b) => b.id === id);
    if (idx < 0) return;
    const copy = { ...value[idx], id: crypto.randomUUID() } as Block;
    const arr = [...value];
    arr.splice(idx + 1, 0, copy);
    onChange(arr);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = value.findIndex((b) => b.id === active.id);
    const newIdx = value.findIndex((b) => b.id === over.id);
    onChange(arrayMove(value, oldIdx, newIdx));
  };

  const html = renderPreview(value);

  return (
    <div className="grid grid-cols-[260px,1fr,320px] gap-4 h-[calc(100vh-220px)]">
      {/* Left: Palette + Block List */}
      <div className="flex flex-col gap-4 overflow-hidden">
        <Card className="p-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Bausteine</div>
          <div className="grid grid-cols-2 gap-2">
            {PALETTE.map((p) => (
              <Button key={p.type} variant="outline" size="sm" className="justify-start" onClick={() => add(p.type)}>
                <p.icon className="mr-2 h-3.5 w-3.5" />
                <span className="text-xs">{p.label}</span>
              </Button>
            ))}
          </div>
        </Card>
        <Card className="p-3 flex-1 overflow-auto">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Reihenfolge</div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={value.map((b) => b.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {value.map((b) => (
                  <SortableItem key={b.id} block={b} selected={b.id === selectedId}
                    onSelect={() => setSelectedId(b.id)}
                    onDelete={() => remove(b.id)}
                    onDuplicate={() => duplicate(b.id)} />
                ))}
                {value.length === 0 && <div className="text-xs text-muted-foreground p-4 text-center">Füge Bausteine hinzu →</div>}
              </div>
            </SortableContext>
          </DndContext>
        </Card>
      </div>

      {/* Center: Preview */}
      <Card className="flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Vorschau</div>
          <div className="flex gap-1">
            <Button size="sm" variant={device === "desktop" ? "secondary" : "ghost"} onClick={() => setDevice("desktop")}>Desktop</Button>
            <Button size="sm" variant={device === "mobile" ? "secondary" : "ghost"} onClick={() => setDevice("mobile")}>Mobil</Button>
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-muted p-4 flex justify-center">
          <iframe title="Newsletter-Vorschau" srcDoc={html} className="border-0 bg-white shadow"
            style={{ width: device === "mobile" ? 380 : "100%", maxWidth: device === "mobile" ? 380 : 720, height: "100%", minHeight: 600 }} />
        </div>
      </Card>

      {/* Right: Properties */}
      <Card className="p-4 overflow-auto">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Eigenschaften</div>
        {!selected && <div className="text-xs text-muted-foreground">Wähle einen Baustein aus.</div>}
        {selected && <PropsEditor block={selected} onChange={(p) => update(selected.id, p)} />}
      </Card>
    </div>
  );
}

function PropsEditor({ block, onChange }: { block: Block; onChange: (p: Partial<Block>) => void }) {
  if (block.type === "heading") return (
    <div className="space-y-3">
      <div><Label>Text</Label><Input value={block.text} onChange={(e) => onChange({ text: e.target.value } as any)} /></div>
      <div><Label>Größe</Label>
        <Select value={String(block.level ?? 2)} onValueChange={(v) => onChange({ level: Number(v) as 1 | 2 | 3 } as any)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="1">H1 – Sehr groß</SelectItem><SelectItem value="2">H2 – Groß</SelectItem><SelectItem value="3">H3 – Mittel</SelectItem></SelectContent>
        </Select>
      </div>
      <AlignField value={block.align ?? "left"} onChange={(v) => onChange({ align: v } as any)} />
    </div>
  );
  if (block.type === "text") return (
    <div className="space-y-3">
      <div><Label>HTML-Text</Label><Textarea rows={10} value={block.html} onChange={(e) => onChange({ html: e.target.value } as any)} /></div>
      <p className="text-xs text-muted-foreground">Tipp: &lt;strong&gt;, &lt;em&gt;, &lt;a href="…"&gt;Link&lt;/a&gt;, &lt;br /&gt;</p>
      <AlignField value={block.align ?? "left"} onChange={(v) => onChange({ align: v } as any)} />
    </div>
  );
  if (block.type === "image") return (
    <div className="space-y-3">
      <div><Label>Bild-URL</Label><Input value={block.src} onChange={(e) => onChange({ src: e.target.value } as any)} placeholder="https://…" /></div>
      <div><Label>Alt-Text</Label><Input value={block.alt ?? ""} onChange={(e) => onChange({ alt: e.target.value } as any)} /></div>
      <div><Label>Link (optional)</Label><Input value={block.href ?? ""} onChange={(e) => onChange({ href: e.target.value } as any)} placeholder="https://…" /></div>
      <div><Label>Breite (px)</Label><Input type="number" value={block.width ?? 560} onChange={(e) => onChange({ width: Number(e.target.value) } as any)} /></div>
    </div>
  );
  if (block.type === "button") return (
    <div className="space-y-3">
      <div><Label>Text</Label><Input value={block.text} onChange={(e) => onChange({ text: e.target.value } as any)} /></div>
      <div><Label>Link</Label><Input value={block.href} onChange={(e) => onChange({ href: e.target.value } as any)} /></div>
      <AlignField value={block.align ?? "center"} onChange={(v) => onChange({ align: v } as any)} />
    </div>
  );
  if (block.type === "spacer") return (
    <div><Label>Höhe (px)</Label><Input type="number" value={block.height ?? 24} onChange={(e) => onChange({ height: Number(e.target.value) } as any)} /></div>
  );
  if (block.type === "divider") return <div className="text-xs text-muted-foreground">Keine Optionen.</div>;
  return <div className="text-xs text-muted-foreground">Spalten-Inhalt wird in einer späteren Version unterstützt.</div>;
}

function AlignField({ value, onChange }: { value: string; onChange: (v: any) => void }) {
  return (
    <div><Label>Ausrichtung</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="left">Links</SelectItem><SelectItem value="center">Mittig</SelectItem><SelectItem value="right">Rechts</SelectItem></SelectContent>
      </Select>
    </div>
  );
}
