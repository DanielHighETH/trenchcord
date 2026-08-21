import type { MessageComponent } from '../discord/types.js';

/**
 * All human-readable text carried by a message's component tree, flattened to
 * one newline-joined string.
 *
 * Components v2 messages (flag 1<<15) have empty `content`/`embeds` -- their
 * whole body lives in `components` -- so contract detection, keyword matching,
 * chain hints and the snipe engine all need this text alongside the classic
 * fields. Button/link URLs are included too: v2 caller bots put their gmgn/
 * chart links on link buttons, which the chain-hint extractors scan for.
 */
export function extractComponentText(components?: MessageComponent[] | null): string {
  if (!components || components.length === 0) return '';
  const parts: string[] = [];
  const walk = (c: MessageComponent | undefined) => {
    if (!c || typeof c !== 'object') return;
    if (typeof c.content === 'string' && c.content) parts.push(c.content);
    if (typeof c.label === 'string' && c.label) parts.push(c.label);
    if (typeof c.url === 'string' && c.url) parts.push(c.url);
    if (typeof c.description === 'string' && c.description) parts.push(c.description);
    for (const item of c.items ?? []) {
      if (typeof item?.description === 'string' && item.description) parts.push(item.description);
    }
    walk(c.accessory);
    for (const child of c.components ?? []) walk(child);
  };
  for (const c of components) walk(c);
  return parts.join('\n');
}
