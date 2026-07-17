import React from "react";

/**
 * Render Slack "mrkdwn" as React nodes.
 *
 * Slack does not send HTML — it sends its own markup: `:emoji:` shortcodes,
 * `*bold*` / `_italic_` / `~strike~` / `` `code` ``, and angle-bracket entities
 * for links and mentions (`<url|label>`, `<@U123>`, `<#C1|name>`, `<!here>`).
 * The dashboard was printing that raw, so a Reddie bot line showed up as
 * `:pencil2: Issue #113554 ... *Progress*: 0 → 50 <https://…|View in Redmine>`.
 * This turns it into the intended emoji, bold text, and clickable link.
 */

// Common Slack shortcodes. Unknown names are left as `:name:` rather than
// guessed — better a readable token than a wrong glyph.
const EMOJI: Record<string, string> = {
  "+1": "👍", thumbsup: "👍", "-1": "👎", thumbsdown: "👎",
  sparkles: "✨", pencil2: "✏️", memo: "📝", clipboard: "📋",
  small_red_triangle: "🔺", small_red_triangle_down: "🔻",
  bust_in_silhouette: "👤", busts_in_silhouette: "👥",
  white_check_mark: "✅", heavy_check_mark: "✔️", x: "❌", no_entry: "⛔",
  warning: "⚠️", rotating_light: "🚨", fire: "🔥", tada: "🎉", rocket: "🚀",
  calendar: "📅", date: "📆", alarm_clock: "⏰", hourglass: "⏳",
  chart_with_upwards_trend: "📈", chart_with_downwards_trend: "📉",
  bug: "🐛", wrench: "🔧", hammer: "🔨", gear: "⚙️", package: "📦",
  bell: "🔔", label: "🏷️", pushpin: "📌", round_pushpin: "📍",
  speech_balloon: "💬", email: "📧", envelope: "✉️", link: "🔗", paperclip: "📎",
  page_facing_up: "📄", lock: "🔒", unlock: "🔓", mag: "🔍", bulb: "💡",
  green_circle: "🟢", red_circle: "🔴", yellow_circle: "🟡",
  large_blue_circle: "🔵", white_circle: "⚪", black_circle: "⚫",
  heart: "❤️", star: "⭐", eyes: "👀", ok_hand: "👌", raised_hands: "🙌",
  clap: "👏", pray: "🙏", muscle: "💪", question: "❓", exclamation: "❗",
  bangbang: "‼️", "100": "💯", arrow_right: "➡️", heavy_plus_sign: "➕",
  laugh: "😂", confused: "😕",
};

/** Public: map a Slack emoji shortcode name to a glyph, or null if unknown. */
export function emojiForShortcode(name: string): string | null {
  return EMOJI[name.replace(/::skin-tone-\d::?$/, "")] ?? null;
}

function decodeEntities(text: string): string {
  // Slack escapes only these three in message text.
  return text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

// Inline formatting inside a plain-text run (no angle-bracket entities here).
const INLINE = /(:[a-z0-9_+-]+:)|(\*[^*\n]+\*)|(_[^_\n]+_)|(~[^~\n]+~)|(`[^`\n]+`)/gi;

function formatInline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(text)) !== null) {
    if (m.index > last) out.push(decodeEntities(text.slice(last, m.index)));
    const token = m[0];
    const key = `${keyBase}-i${i++}`;
    if (m[1]) {
      const name = token.slice(1, -1);
      out.push(emojiForShortcode(name) ?? token);
    } else if (m[2]) {
      out.push(<strong key={key}>{decodeEntities(token.slice(1, -1))}</strong>);
    } else if (m[3]) {
      out.push(<em key={key}>{decodeEntities(token.slice(1, -1))}</em>);
    } else if (m[4]) {
      out.push(<del key={key}>{decodeEntities(token.slice(1, -1))}</del>);
    } else if (m[5]) {
      out.push(<code key={key}>{decodeEntities(token.slice(1, -1))}</code>);
    }
    last = m.index + token.length;
  }
  if (last < text.length) out.push(decodeEntities(text.slice(last)));
  return out;
}

function renderEntity(
  inner: string,
  userNames: Record<string, string>,
  key: string,
): React.ReactNode {
  // <@U123> or <@U123|label> — user mention
  if (inner.startsWith("@")) {
    const [id, label] = inner.slice(1).split("|");
    const name = label || userNames[id] || id;
    return (
      <span key={key} className="slack-mention">
        @{name}
      </span>
    );
  }
  // <#C123|name> — channel mention
  if (inner.startsWith("#")) {
    const [id, label] = inner.slice(1).split("|");
    return (
      <span key={key} className="slack-mention">
        #{label || id}
      </span>
    );
  }
  // <!here>, <!channel>, <!everyone> — special mentions
  if (inner.startsWith("!")) {
    const [name, label] = inner.slice(1).split("|");
    return (
      <span key={key} className="slack-mention">
        @{label || name}
      </span>
    );
  }
  // <url> or <url|label> — link
  const [url, label] = inner.split("|");
  return (
    <a key={key} href={url} target="_blank" rel="noopener noreferrer" className="slack-link">
      {label || url}
    </a>
  );
}

/**
 * Convert a Slack mrkdwn string to React nodes. Newlines are preserved as-is
 * (render inside an element with `white-space: pre-wrap`).
 */
export function renderSlackMarkdown(
  text: string,
  userNames: Record<string, string> = {},
): React.ReactNode[] {
  if (!text) return [];
  const out: React.ReactNode[] = [];
  // Entities <...> never nest and can't contain a '>', so split on them first.
  const ENTITY = /<([^>]+)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = ENTITY.exec(text)) !== null) {
    if (m.index > last) {
      out.push(...formatInline(text.slice(last, m.index), `t${i}`));
    }
    out.push(renderEntity(m[1], userNames, `e${i}`));
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) {
    out.push(...formatInline(text.slice(last), `t${i}`));
  }
  return out;
}
