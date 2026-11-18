import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Underline, Link as LinkIcon, List, ListOrdered, Heading1, Heading2, AlignLeft, AlignCenter, AlignRight, Undo2, Redo2, Braces, Eye, Code2, Palette, Highlighter } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { getPlaceholderMeta } from "@/lib/placeholder-meta";

interface Props {
  /** Aktuelles HTML (mit Platzhaltern wie {{customer_first_name}}) */
  value: string;
  /** Callback wenn der Nutzer das HTML bearbeitet */
  onChange: (html: string) => void;
  /** Funktion zum Ersetzen von Platzhaltern für die Vorschau-Ansicht */
  renderPreview: (html: string) => string;
  /** Verfügbare Platzhalter für diese Vorlage (ohne Klammern) */
  placeholders?: string[];
}

/**
 * Visueller Editor: zeigt die E-Mail in einem contentEditable iframe.
 * Platzhalter (`{{key}}`) werden als gelbe, nicht-editierbare Chips angezeigt,
 * sodass sie sichtbar sind und mit Backspace/Delete gelöscht bzw. per Toolbar
 * eingefügt werden können. Optional lässt sich auf eine Vorschau mit
 * Beispiel-Daten umschalten.
 */
export function EmailVisualEditor({ value, onChange, renderPreview, placeholders = [] }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastEmittedRef = useRef<string>("");
  const [showSample, setShowSample] = useState(false);

  // Platzhalter, die im Editor immer ausgeschrieben angezeigt werden
  // (statt als gelber Chip). Der Rohtext behält den Platzhalter — die
  // Ersetzung passiert nur in der Ansicht des visuellen Editors.
  const ALWAYS_EXPANDED: Record<string, string> = {
    site_name: "Santosha Yoga",
  };

  // Baut Ansichts-HTML: Platzhalter als Chips einwickeln (außer ALWAYS_EXPANDED).
  // WICHTIG: Nur Platzhalter in Text-Knoten ersetzen — niemals innerhalb von
  // Tag-Attributen (z. B. `href="{{dashboard_url}}"`), sonst zerbricht das HTML.
  const buildEditorHtml = (raw: string) => {
    const tpl = document.createElement("template");
    tpl.innerHTML = raw;
    const walker = document.createTreeWalker(tpl.content, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let n: Node | null;
    while ((n = walker.nextNode())) textNodes.push(n as Text);

    const re = /\{\{\s*([\w.]+)\s*\}\}/g;
    for (const node of textNodes) {
      const text = node.nodeValue ?? "";
      if (!re.test(text)) continue;
      re.lastIndex = 0;
      const frag = document.createDocumentFragment();
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        const key = m[1];
        const span = document.createElement("span");
        span.setAttribute("data-ph", key);
        span.setAttribute("contenteditable", "false");
        if (key in ALWAYS_EXPANDED) {
          span.setAttribute("data-ph-expanded", "1");
          span.textContent = ALWAYS_EXPANDED[key];
        } else {
          span.className = "ph-chip";
          span.textContent = `{{${key}}}`;
        }
        frag.appendChild(span);
        last = m.index + m[0].length;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      node.parentNode?.replaceChild(frag, node);
    }
    return tpl.innerHTML;
  };

  // Serialisiert iframe-HTML zurück in Platzhalter-Text.
  const serialize = (doc: Document): string => {
    // Klon, um Chips durch reinen {{key}}-Text zu ersetzen
    const clone = doc.body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("[data-ph]").forEach((el) => {
      const key = (el as HTMLElement).dataset.ph;
      const txt = doc.createTextNode(`{{${key}}}`);
      el.replaceWith(txt);
    });
    return clone.innerHTML;
  };

  // Inhalt in iframe injizieren, wenn sich das Quell-HTML extern ändert
  // oder der Vorschau-Modus umgeschaltet wird.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    // Wenn diese Änderung aus dem Editor selbst kam, nicht neu injizieren
    if (value === lastEmittedRef.current) return;

    const html = showSample
      ? renderPreview(value)
      : buildEditorHtml(value);

    const doc = iframe.contentDocument;
    if (!doc) return;

    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>
      body { margin: 0; padding: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; min-height: 100%; }
      body:focus { outline: none; }
      img { max-width: 100%; height: auto; }
      a { color: #0a66c2; }
      .ph-chip {
        display: inline-block;
        background: #fef3c7;
        color: #78350f;
        border: 1px solid #fcd34d;
        border-radius: 4px;
        padding: 0 6px;
        margin: 0 1px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 0.85em;
        white-space: nowrap;
        user-select: all;
      }
    </style></head><body contenteditable="${showSample ? "false" : "true"}">${html}</body></html>`);
    doc.close();

    if (showSample) return;

    const handleInput = () => {
      const out = serialize(doc);
      lastEmittedRef.current = out;
      onChange(out);
    };
    doc.body.addEventListener("input", handleInput);
    return () => {
      doc.body.removeEventListener("input", handleInput);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, showSample]);

  const focusBody = () => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return null;
    doc.body.focus();
    return doc;
  };

  const exec = (command: string, val?: string) => {
    const doc = focusBody();
    if (!doc) return;
    doc.execCommand(command, false, val);
    const out = serialize(doc);
    lastEmittedRef.current = out;
    onChange(out);
  };

  const insertLink = () => {
    const url = prompt("URL eingeben:", "https://");
    if (url) exec("createLink", url);
  };

  // Farbe auf Auswahl anwenden. Für Hintergrund bevorzugt hiliteColor,
  // Fallback backColor (Firefox-Kompatibilität).
  const applyColor = (kind: "fore" | "back", color: string | null) => {
    const doc = focusBody();
    if (!doc) return;
    if (color === null) {
      // Reset: entfernt Inline-Formatierung der Auswahl
      doc.execCommand("removeFormat");
    } else if (kind === "fore") {
      doc.execCommand("styleWithCSS", false, "true");
      doc.execCommand("foreColor", false, color);
    } else {
      doc.execCommand("styleWithCSS", false, "true");
      if (!doc.execCommand("hiliteColor", false, color)) {
        doc.execCommand("backColor", false, color);
      }
    }
    const out = serialize(doc);
    lastEmittedRef.current = out;
    onChange(out);
  };

  const TEXT_COLORS = [
    { label: "Standard", value: "#111827" },
    { label: "Grau", value: "#6b7280" },
    { label: "Weiß", value: "#ffffff" },
    { label: "Gold", value: "#c9a96e" },
    { label: "Rot", value: "#dc2626" },
    { label: "Grün", value: "#16a34a" },
    { label: "Blau", value: "#2563eb" },
  ];
  const BG_COLORS = [
    { label: "Hellgelb", value: "#fef3c7" },
    { label: "Hellgrün", value: "#dcfce7" },
    { label: "Hellblau", value: "#dbeafe" },
    { label: "Hellrosa", value: "#fce7f3" },
    { label: "Hellgrau", value: "#f3f4f6" },
    { label: "Gold", value: "#c9a96e" },
    { label: "Schwarz", value: "#111827" },
  ];


  const insertPlaceholder = (key: string) => {
    if (showSample) setShowSample(false);
    const doc = focusBody();
    if (!doc) return;
    const chip = key in ALWAYS_EXPANDED
      ? `<span data-ph="${key}" data-ph-expanded="1" contenteditable="false">${ALWAYS_EXPANDED[key]}</span>&nbsp;`
      : `<span data-ph="${key}" contenteditable="false" class="ph-chip">{{${key}}}</span>&nbsp;`;
    doc.execCommand("insertHTML", false, chip);
    const out = serialize(doc);
    lastEmittedRef.current = out;
    onChange(out);
  };

  return (
    <div className="border border-border rounded-md overflow-hidden bg-white">
      <div className="flex flex-wrap items-center gap-1 p-1 border-b border-border bg-muted/40">
        <ToolbarBtn onClick={() => exec("undo")} title="Rückgängig" disabled={showSample}><Undo2 className="h-3.5 w-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => exec("redo")} title="Wiederholen" disabled={showSample}><Redo2 className="h-3.5 w-3.5" /></ToolbarBtn>
        <Sep />
        <ToolbarBtn onClick={() => exec("formatBlock", "h1")} title="Überschrift 1" disabled={showSample}><Heading1 className="h-3.5 w-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => exec("formatBlock", "h2")} title="Überschrift 2" disabled={showSample}><Heading2 className="h-3.5 w-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => exec("formatBlock", "p")} title="Absatz" disabled={showSample}>P</ToolbarBtn>
        <Sep />
        <ToolbarBtn onClick={() => exec("bold")} title="Fett" disabled={showSample}><Bold className="h-3.5 w-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => exec("italic")} title="Kursiv" disabled={showSample}><Italic className="h-3.5 w-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => exec("underline")} title="Unterstrichen" disabled={showSample}><Underline className="h-3.5 w-3.5" /></ToolbarBtn>
        <Sep />
        <ToolbarBtn onClick={() => exec("insertUnorderedList")} title="Liste" disabled={showSample}><List className="h-3.5 w-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => exec("insertOrderedList")} title="Nummerierte Liste" disabled={showSample}><ListOrdered className="h-3.5 w-3.5" /></ToolbarBtn>
        <Sep />
        <ToolbarBtn onClick={() => exec("justifyLeft")} title="Links" disabled={showSample}><AlignLeft className="h-3.5 w-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => exec("justifyCenter")} title="Mitte" disabled={showSample}><AlignCenter className="h-3.5 w-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => exec("justifyRight")} title="Rechts" disabled={showSample}><AlignRight className="h-3.5 w-3.5" /></ToolbarBtn>
        <Sep />
        <ToolbarBtn onClick={insertLink} title="Link" disabled={showSample}><LinkIcon className="h-3.5 w-3.5" /></ToolbarBtn>
        <Sep />
        <ColorPickerButton
          icon={<Palette className="h-3.5 w-3.5" />}
          title="Textfarbe"
          presets={TEXT_COLORS}
          onPick={(c) => applyColor("fore", c)}
          disabled={showSample}
        />
        <ColorPickerButton
          icon={<Highlighter className="h-3.5 w-3.5" />}
          title="Hintergrundfarbe"
          presets={BG_COLORS}
          onPick={(c) => applyColor("back", c)}
          disabled={showSample}
        />

        {placeholders.length > 0 && (
          <>
            <Sep />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  title="Platzhalter einfügen"
                  className="h-7 px-2 inline-flex items-center gap-1 text-xs rounded hover:bg-background border border-transparent hover:border-border transition-colors"
                >
                  <Braces className="h-3.5 w-3.5" />
                  Platzhalter
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-72 overflow-auto">
                <DropdownMenuLabel className="text-xs">
                  Beim Versand ersetzt
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {placeholders.map((p) => {
                  const meta = getPlaceholderMeta(p);
                  const Icon = meta.icon;
                  return (
                    <DropdownMenuItem
                      key={p}
                      onSelect={() => insertPlaceholder(p)}
                      className="text-xs gap-2"
                    >
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{meta.label}</span>
                      <span className="ml-auto font-mono text-[10px] text-muted-foreground/70">
                        {`{{${p}}}`}
                      </span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          <ToolbarBtn
            onClick={() => setShowSample((v) => !v)}
            title={showSample ? "Zurück zum Editor" : "Vorschau mit Beispieldaten"}
          >
            {showSample ? (
              <><Code2 className="h-3.5 w-3.5 mr-1" />Bearbeiten</>
            ) : (
              <><Eye className="h-3.5 w-3.5 mr-1" />Beispieldaten</>
            )}
          </ToolbarBtn>
        </div>
      </div>
      <iframe
        ref={iframeRef}
        title="email-visual-editor"
        className="w-full bg-white"
        style={{ height: "65vh", border: 0 }}
      />
      <div className="px-3 py-2 border-t border-border bg-muted/40 text-[10px] text-muted-foreground">
        Platzhalter wie <span className="inline-block px-1.5 rounded font-mono" style={{ background: "#fef3c7", color: "#78350f", border: "1px solid #fcd34d" }}>{"{{customer_first_name}}"}</span> sind Chips: mit Backspace löschen, per „Platzhalter"-Menü einfügen. Über „Beispieldaten" siehst du, wie die fertige Mail aussieht.
      </div>
    </div>
  );
}

function ToolbarBtn({ children, onClick, title, disabled }: { children: React.ReactNode; onClick: () => void; title: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="h-7 min-w-7 px-1.5 inline-flex items-center justify-center text-xs rounded hover:bg-background border border-transparent hover:border-border transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div className="w-px h-5 bg-border mx-0.5" />;
}

function ColorPickerButton({
  icon,
  title,
  presets,
  onPick,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  presets: { label: string; value: string }[];
  onPick: (color: string | null) => void;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          title={title}
          disabled={disabled}
          className="h-7 min-w-7 px-1.5 inline-flex items-center justify-center text-xs rounded hover:bg-background border border-transparent hover:border-border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {icon}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="p-2 w-56">
        <DropdownMenuLabel className="text-xs px-1 pb-1">{title}</DropdownMenuLabel>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {presets.map((p) => (
            <button
              key={p.value}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(p.value)}
              title={p.label}
              className="h-6 w-6 rounded border border-border hover:scale-110 transition-transform"
              style={{ background: p.value }}
            />
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs px-1 py-1 cursor-pointer">
          <input
            type="color"
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => onPick(e.target.value)}
            className="h-6 w-8 rounded border border-border cursor-pointer bg-transparent"
          />
          <span className="text-muted-foreground">Eigene Farbe</span>
        </label>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => onPick(null)}
          className="text-xs"
        >
          Formatierung entfernen
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

