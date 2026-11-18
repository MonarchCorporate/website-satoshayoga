// Ported from supabase/functions (Deno) by scripts/port_functions.py
// Shared block renderer for newsletter campaigns.
// Converts a campaign content_json (array of blocks) into responsive,
// table-based HTML email markup with inline styles.

export type Block =
  | { id: string; type: "heading"; text: string; level?: 1 | 2 | 3; align?: "left" | "center" | "right" }
  | { id: string; type: "text"; html: string; align?: "left" | "center" | "right" }
  | { id: string; type: "image"; src: string; alt?: string; href?: string; width?: number }
  | { id: string; type: "button"; text: string; href: string; align?: "left" | "center" | "right" }
  | { id: string; type: "spacer"; height?: number }
  | { id: string; type: "divider" }
  | { id: string; type: "columns"; columns: Block[][] };

export interface RenderContext {
  trackingBaseUrl: string; // e.g. https://<project>.supabase.co/functions/v1
  recipientId?: string; // if omitted -> preview mode (no tracking)
  campaignId: string;
  unsubscribeUrl?: string; // full URL to unsubscribe page
  footerText?: string;
  footerAddress?: string;
  // map of original URL -> link_id (created beforehand)
  linkMap?: Record<string, string>;
  brandColor?: string;
}

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const wrapTrackedLink = (href: string, ctx: RenderContext): string => {
  if (!ctx.recipientId || !ctx.linkMap || !ctx.linkMap[href]) return href;
  const linkId = ctx.linkMap[href];
  const u = new URL(`${ctx.trackingBaseUrl}/newsletter-track-click`);
  u.searchParams.set("r", ctx.recipientId);
  u.searchParams.set("l", linkId);
  return u.toString();
};

const renderBlock = (b: Block, ctx: RenderContext): string => {
  switch (b.type) {
    case "heading": {
      const tag = `h${b.level ?? 2}`;
      const align = b.align ?? "left";
      return `<tr><td style="padding:8px 24px;text-align:${align}"><${tag} style="margin:0;font-family:Georgia,serif;color:#1a1a1a;font-weight:400;line-height:1.2;">${escape(b.text)}</${tag}></td></tr>`;
    }
    case "text": {
      const align = b.align ?? "left";
      // We trust admin HTML here but strip <script> as a basic precaution.
      const safe = b.html.replace(/<script[\s\S]*?<\/script>/gi, "");
      return `<tr><td style="padding:8px 24px;text-align:${align};font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#333">${safe}</td></tr>`;
    }
    case "image": {
      const w = b.width ?? 560;
      const img = `<img src="${escape(b.src)}" alt="${escape(b.alt ?? "")}" width="${w}" style="display:block;max-width:100%;height:auto;border:0;outline:none;text-decoration:none" />`;
      const inner = b.href ? `<a href="${escape(wrapTrackedLink(b.href, ctx))}" target="_blank">${img}</a>` : img;
      return `<tr><td style="padding:8px 24px;text-align:center">${inner}</td></tr>`;
    }
    case "button": {
      const align = b.align ?? "center";
      const color = ctx.brandColor ?? "#c8a96a";
      const href = escape(wrapTrackedLink(b.href, ctx));
      return `<tr><td style="padding:16px 24px;text-align:${align}">
        <a href="${href}" target="_blank" style="display:inline-block;padding:12px 28px;background:${color};color:#1a1a1a;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;letter-spacing:0.05em;border-radius:4px">${escape(b.text)}</a>
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

export const renderCampaign = (blocks: Block[], ctx: RenderContext): string => {
  const body = blocks.map((b) => renderBlock(b, ctx)).join("");

  const trackingPixel = ctx.recipientId
    ? `<img src="${ctx.trackingBaseUrl}/newsletter-track-open?r=${ctx.recipientId}" width="1" height="1" alt="" style="display:block;width:1px;height:1px" />`
    : "";

  const footer = `
    <tr><td style="padding:24px;border-top:1px solid #eee;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#888;text-align:center">
      ${ctx.footerText ? `<div>${escape(ctx.footerText)}</div>` : ""}
      ${ctx.footerAddress ? `<div style="margin-top:6px">${escape(ctx.footerAddress)}</div>` : ""}
      ${ctx.unsubscribeUrl ? `<div style="margin-top:12px"><a href="${escape(ctx.unsubscribeUrl)}" style="color:#888;text-decoration:underline">Vom Newsletter abmelden</a></div>` : ""}
    </td></tr>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f4">
  <tr><td align="center" style="padding:24px 0">
    <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;max-width:600px;width:100%;border-radius:6px;overflow:hidden">
      ${body}
      ${footer}
    </table>
  </td></tr>
</table>
${trackingPixel}
</body></html>`;
};

export const extractLinks = (blocks: Block[]): { url: string; label?: string }[] => {
  const out: { url: string; label?: string }[] = [];
  const visit = (b: Block) => {
    if (b.type === "button" && b.href) out.push({ url: b.href, label: b.text });
    else if (b.type === "image" && b.href) out.push({ url: b.href, label: b.alt });
    else if (b.type === "text") {
      const re = /href=["']([^"']+)["']/gi;
      let m;
      while ((m = re.exec(b.html))) out.push({ url: m[1] });
    } else if (b.type === "columns") b.columns.forEach((c) => c.forEach(visit));
  };
  blocks.forEach(visit);
  return out;
};
