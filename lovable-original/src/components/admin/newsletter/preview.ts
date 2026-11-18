import type { Block } from "./types";

interface Ctx {
  brandColor?: string;
  inEditor?: boolean;
}

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const renderBlock = (b: Block, ctx: Ctx): string => {
  switch (b.type) {
    case "heading": {
      const tag = `h${b.level ?? 2}`;
      const align = b.align ?? "left";
      return `<tr><td style="padding:8px 24px;text-align:${align}"><${tag} style="margin:0;font-family:Georgia,serif;color:#1a1a1a;font-weight:400;line-height:1.2;">${escape(b.text)}</${tag}></td></tr>`;
    }
    case "text": {
      const align = b.align ?? "left";
      const safe = b.html.replace(/<script[\s\S]*?<\/script>/gi, "");
      return `<tr><td style="padding:8px 24px;text-align:${align};font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#333">${safe}</td></tr>`;
    }
    case "image": {
      const w = b.width ?? 560;
      const img = `<img src="${escape(b.src || "https://via.placeholder.com/600x300?text=Bild")}" alt="${escape(b.alt ?? "")}" width="${w}" style="display:block;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;margin:0 auto" />`;
      const inner = b.href ? `<a href="${escape(b.href)}" target="_blank">${img}</a>` : img;
      return `<tr><td style="padding:8px 24px;text-align:center">${inner}</td></tr>`;
    }
    case "button": {
      const align = b.align ?? "center";
      const color = ctx.brandColor ?? "#c8a96a";
      return `<tr><td style="padding:16px 24px;text-align:${align}">
        <a href="${escape(b.href || "#")}" target="_blank" style="display:inline-block;padding:12px 28px;background:${color};color:#1a1a1a;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;letter-spacing:0.05em;border-radius:4px">${escape(b.text)}</a>
      </td></tr>`;
    }
    case "spacer":
      return `<tr><td style="height:${b.height ?? 24}px;line-height:${b.height ?? 24}px;font-size:0">&nbsp;</td></tr>`;
    case "divider":
      return `<tr><td style="padding:8px 24px"><hr style="border:none;border-top:1px solid #e5e5e5;margin:0" /></td></tr>`;
    case "columns": {
      const cols = b.columns;
      const widthPct = Math.floor(100 / cols.length);
      const tds = cols
        .map(
          (col) =>
            `<td valign="top" width="${widthPct}%" style="padding:0 8px"><table width="100%" cellpadding="0" cellspacing="0" border="0">${col
              .map((c) => renderBlock(c, ctx))
              .join("")}</table></td>`,
        )
        .join("");
      return `<tr><td style="padding:0 16px"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${tds}</tr></table></td></tr>`;
    }
    default:
      return "";
  }
};

export const renderPreview = (blocks: Block[], ctx: Ctx = {}): string => {
  const body = blocks.map((b) => renderBlock(b, ctx)).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f4">
  <tr><td align="center" style="padding:24px 0">
    <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#fff;max-width:600px;width:100%;border-radius:6px;overflow:hidden">
      ${body}
      <tr><td style="padding:24px;border-top:1px solid #eee;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#888;text-align:center">[Footer + Abmelde-Link werden beim Versand automatisch ergänzt]</td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
};
