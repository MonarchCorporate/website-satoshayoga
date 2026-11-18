export type Block =
  | { id: string; type: "heading"; text: string; level?: 1 | 2 | 3; align?: "left" | "center" | "right" }
  | { id: string; type: "text"; html: string; align?: "left" | "center" | "right" }
  | { id: string; type: "image"; src: string; alt?: string; href?: string; width?: number }
  | { id: string; type: "button"; text: string; href: string; align?: "left" | "center" | "right" }
  | { id: string; type: "spacer"; height?: number }
  | { id: string; type: "divider" }
  | { id: string; type: "columns"; columns: Block[][] };

export const newBlock = (type: Block["type"]): Block => {
  const id = crypto.randomUUID();
  switch (type) {
    case "heading": return { id, type, text: "Neue Überschrift", level: 2, align: "left" };
    case "text": return { id, type, html: "<p>Dein Text hier. Du kannst <strong>HTML</strong> verwenden.</p>", align: "left" };
    case "image": return { id, type, src: "", alt: "" };
    case "button": return { id, type, text: "Jetzt buchen", href: "https://", align: "center" };
    case "spacer": return { id, type, height: 24 };
    case "divider": return { id, type };
    case "columns": return { id, type, columns: [[], []] };
  }
};
