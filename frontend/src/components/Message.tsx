import { type ReactNode, Fragment, useState, useEffect, useRef, memo } from 'react';
import { Eye, MessageSquareReply, ExternalLink, Forward, Play, X, Check, Image as ImageIcon } from 'lucide-react';
import type { FrontendMessage, FrontendReaction, ContractLinkTemplates, ContractClickAction, BadgeClickAction, HighlightMode, MessageDisplay, MessageComponent, ReactionUser } from '../types';
import { useAppStore } from '../stores/appStore';
import ImageLightbox from './ImageLightbox';
import UserContextMenu from './UserContextMenu';
import TradeButtons from './TradeButtons';
import VoiceMessage, { isVoiceAttachment } from './VoiceMessage';
import { detectAddresses } from '../utils/addressDetect';
import { isIOSApp } from '../utils/platform';
import { buildContractUrl, DEFAULT_LINK_TEMPLATES } from '../utils/contractUrl';
import { colorWithExtraAlpha } from './ColorPickerWithAlpha';

interface AddressColors {
  evm: string;
  sol: string;
}

interface MessageProps {
  message: FrontendMessage;
  isCompact: boolean;
  messageDisplay?: MessageDisplay;
  compactModeAvatars?: boolean;
  /** Compact mode: show the author header only on the first message of a
   * consecutive group; follow-ups render content only. */
  compactModeNameOnce?: boolean;
  guildColor?: string;
  highlightMode?: HighlightMode;
  highlightColor?: string;
  disableEmbeds?: boolean;
  evmAddressColor?: string;
  solAddressColor?: string;
  contractLinkTemplates?: ContractLinkTemplates;
  contractClickAction?: ContractClickAction;
  showFullContractAddress?: boolean;
  openInDiscordApp?: boolean;
  openInTelegramApp?: boolean;
  badgeClickAction?: BadgeClickAction;
  /** Icon-style source badge: server image + #channel instead of "Server / #channel". */
  serverIconBadge?: boolean;
  /** Guild icon hash for the icon-style badge (null/undefined = no icon set). */
  guildIcon?: string | null;
  /** Custom display names (author id → name); overrides the platform name. */
  customUserNames?: Record<string, string>;
  onRenameUser?: (userId: string, name: string | null) => void;
  onHideUser?: (guildId: string | null, channelId: string, userId: string, displayName: string) => void;
  onHideRole?: (guildId: string, roleId: string, roleName: string) => void;
  onToggleHighlightRole?: (guildId: string, roleId: string, roleName: string) => void;
  /** Role ids currently highlighted in the active room, so the context menu
   * can show which of the author's roles are already highlighted. */
  highlightedRoleIds?: string[];
  onToggleHighlight?: (userId: string, displayName: string) => void;
  isUserHighlighted?: boolean;
  /** Highlighted via one of the author's roles (not the user directly). Styles
   * the row like a user highlight but keeps the username in its role color. */
  isRoleHighlighted?: boolean;
  onFocus?: (guildId: string | null, channelId: string, guildName: string | null, channelName: string) => void;
  isFocused?: boolean;
  onQuickReply?: (channelId: string) => void;
  /** Drops this message from the feed it is rendered in (Mentions, Keywords).
   * Absent in normal rooms, where messages aren't a triage list. */
  onDismiss?: () => void;
  chattingEnabled?: boolean;
  roleColors?: boolean;
}

/**
 * iOS's Core Graphics decoder chokes on Discord's WebP variants and WebKit
 * spams `makeImagePlus … 'WEBP' … err=-50` for every attempt, so the iOS app
 * asks the Discord CDN for PNG instead. Desktop/web keep WebP (smaller).
 */
export function webpSafeUrl(url: string): string {
  if (!isIOSApp()) return url;
  try {
    const u = new URL(url);
    if (u.hostname.endsWith('discordapp.com') || u.hostname.endsWith('discordapp.net')) {
      if (u.pathname.endsWith('.webp')) u.pathname = u.pathname.slice(0, -5) + '.png';
      if (u.searchParams.get('format') === 'webp') u.searchParams.set('format', 'png');
      return u.toString();
    }
  } catch {
    // Relative or malformed URL — leave it alone.
  }
  return url;
}

export function getAvatarUrl(userId: string, avatar: string | null, discriminator?: string): string {
  if (avatar && (avatar.startsWith('/') || avatar.startsWith('http'))) {
    return webpSafeUrl(avatar);
  }
  if (avatar) {
    const ext = isIOSApp() ? 'png' : 'webp';
    return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.${ext}?size=80`;
  }
  let index: bigint | number;
  try {
    index = discriminator === '0' || !discriminator
      ? (BigInt(userId) >> 22n) % 6n
      : parseInt(discriminator) % 5;
  } catch {
    // Non-numeric author id (e.g. Telegram-sourced) — any default avatar
    // works, and one odd message must never take down the whole message list.
    index = 0;
  }
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

function formatTimestamp(iso: string, short = false): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  // Today needs no date at all -- nearly every message in view is from today,
  // and "Today at" on all of them is pure noise. Older ones keep their prefix.
  if (isToday) return time;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return short ? `Yest ${time}` : `Yesterday at ${time}`;
  return short ? `${d.toLocaleDateString([], { month: 'numeric', day: 'numeric' })} ${time}` : `${d.toLocaleDateString()} ${time}`;
}

const URL_REGEX = /(https?:\/\/[^\s<>()[\]]+(?:\([^\s<>()]*\))*[^\s<>()[\],.'\"!?;:]?)/g;
const DISCORD_MENTION_REGEX = /<@!?(\d+)>|<#(\d+)>|<@&(\d+)>/g;
const EMOJI_REGEX = /<a?:(\w+):(\d+)>/g;
/** Bold and masked links matched together: whichever opens first wins, and its
 *  contents are formatted recursively, so `**[name](url)**` and `[**name**](url)`
 *  (fomobot, Rick and friends write both) each come out right. Matching them in
 *  separate passes leaves the inner one split across parts, never to match. */
const BOLD_OR_LINK_REGEX = /\*\*(.+?)\*\*|\[([^\]]+)\]\(<?(https?:\/\/[^>)\s]+)>?\)/g;
/** Discord's block-level text: `# `/`## `/`### ` headings and `-# ` subtext. */
const HEADING_REGEX = /^(#{1,3})\s+(\S.*?)\s*$/;
const SUBTEXT_REGEX = /^-#\s+(\S.*?)\s*$/;
const HEADING_CLASSES: Record<number, string> = {
  1: 'text-[1.5rem] leading-[1.875rem] font-bold text-white mt-2 first:mt-0',
  2: 'text-[1.25rem] leading-[1.625rem] font-bold text-white mt-2 first:mt-0',
  3: 'text-[1rem] leading-[1.375rem] font-bold text-white mt-2 first:mt-0',
};
const ANGLE_URL_REGEX = /<(https?:\/\/[^>]+)>/g;
const TIMESTAMP_REGEX = /<t:(\d+)(?::([tTdDfFR]))?>/g;
const CODE_BLOCK_REGEX = /```(?:\w+\n)?([\s\S]*?)```/g;
const INLINE_CODE_REGEX = /`([^`]+)`/g;

function formatDiscordTimestamp(unix: number, style: string): string {
  const d = new Date(unix * 1000);
  switch (style) {
    case 't': return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    case 'T': return d.toLocaleTimeString();
    case 'd': return d.toLocaleDateString();
    case 'D': return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
    case 'f': return d.toLocaleString(undefined, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    case 'F': return d.toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    case 'R': {
      const now = Date.now();
      const diff = now - d.getTime();
      const sec = Math.round(Math.abs(diff) / 1000);
      const past = diff > 0;
      if (sec < 60) return past ? `${sec} seconds ago` : `in ${sec} seconds`;
      const min = Math.round(sec / 60);
      if (min < 60) return past ? `${min} minutes ago` : `in ${min} minutes`;
      const hr = Math.round(min / 60);
      if (hr < 24) return past ? `${hr} hours ago` : `in ${hr} hours`;
      const days = Math.round(hr / 24);
      return past ? `${days} days ago` : `in ${days} days`;
    }
    default: return d.toLocaleString();
  }
}

function linkifyText(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  URL_REGEX.lastIndex = 0;
  while ((match = URL_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const url = match[1];
    parts.push(
      <a
        key={`${keyPrefix}-url-${match.index}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-discord-text-link hover:underline break-all"
      >
        {url}
      </a>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

function contractClickTitle(action: ContractClickAction, addr: string): string {
  switch (action) {
    case 'copy': return `Click to copy: ${addr}`;
    case 'open': return `Click to open: ${addr}`;
    default: return `Click to copy & open: ${addr}`;
  }
}

function handleContractClick(addr: string, action: ContractClickAction, linkTemplates: ContractLinkTemplates) {
  if (action === 'copy' || action === 'copy_open') {
    navigator.clipboard.writeText(addr);
  }
  if (action === 'open' || action === 'copy_open') {
    // Resolve the chain at click time so a link corrected after the message
    // was rendered (e.g. via a Rick follow-up) opens on the right chain.
    const evmChain = useAppStore.getState().addressChains[addr.toLowerCase()];
    window.open(buildContractUrl(addr, linkTemplates, evmChain), '_blank');
  }
}

function applyInlineFormatting(
  parts: (string | ReactNode)[],
  contractAddresses: string[],
  mentions: Record<string, string>,
  addressColors?: AddressColors,
  linkTemplates: ContractLinkTemplates = DEFAULT_LINK_TEMPLATES,
  clickAction: ContractClickAction = 'copy_open',
  showFull: boolean = false,
  /** Inside a link label: no auto-linking or contract pills, which would nest
   *  a second link (or a click handler) inside the one we are already in. */
  insideLink: boolean = false,
): (string | ReactNode)[] {
  const recurse = (text: string, inLink: boolean) =>
    applyInlineFormatting([text], contractAddresses, mentions, addressColors, linkTemplates, clickAction, showFull, insideLink || inLink);

  // Bold **text** and masked links [text](url)
  parts = splitByRegex(parts, BOLD_OR_LINK_REGEX, (m, i) => (
    m[1] !== undefined ? (
      // Bold inside a link keeps the link's colour -- text-white would paint
      // over it and the link would read as plain bold text.
      <strong key={`bold-${i}`} className={insideLink ? 'font-semibold' : 'font-semibold text-white'}>
        {recurse(m[1], false)}
      </strong>
    ) : (
      <a
        key={`mdlink-${i}`}
        href={m[3]}
        target="_blank"
        rel="noopener noreferrer"
        className="text-discord-text-link hover:underline"
      >
        {recurse(m[2], true)}
      </a>
    )
  ));

  // Angle-bracket URLs <https://...>
  parts = splitByRegex(parts, ANGLE_URL_REGEX, (m, i) => (
    <a
      key={`angurl-${i}`}
      href={m[1]}
      target="_blank"
      rel="noopener noreferrer"
      className="text-discord-text-link hover:underline break-all"
    >
      {m[1]}
    </a>
  ));

  // Discord timestamps <t:123456:R>
  parts = splitByRegex(parts, TIMESTAMP_REGEX, (m, i) => {
    const unix = parseInt(m[1]);
    const style = m[2] || 'f';
    const formatted = formatDiscordTimestamp(unix, style);
    const fullDate = new Date(unix * 1000).toLocaleString();
    return (
      <span
        key={`ts-${i}`}
        className="bg-discord-embed-bg px-1 py-0.5 rounded text-discord-text cursor-default"
        title={fullDate}
      >
        {formatted}
      </span>
    );
  });

  // Discord custom emojis
  parts = splitByRegex(parts, EMOJI_REGEX, (m, i) => (
    <img
      key={`emoji-${i}`}
      src={webpSafeUrl(`https://cdn.discordapp.com/emojis/${m[2]}.${m[0].startsWith('<a:') ? 'gif' : 'webp'}?size=20`)}
      alt={`:${m[1]}:`}
      title={`:${m[1]}:`}
      loading="lazy"
      decoding="async"
      className="inline-block w-5 h-5 align-text-bottom mx-0.5"
    />
  ));

  // Discord mentions
  parts = splitByRegex(parts, DISCORD_MENTION_REGEX, (m, i) => {
    let label: string;
    if (m[1]) {
      label = `@${mentions[m[1]] ?? 'user'}`;
    } else if (m[2]) {
      label = `#${mentions[`ch:${m[2]}`] ?? 'channel'}`;
    } else if (m[3]) {
      label = `@${mentions[`role:${m[3]}`] ?? 'role'}`;
    } else {
      label = `@unknown`;
    }
    return (
      <span key={`mention-${i}`} className="bg-discord-blurple/20 text-discord-blurple px-0.5 rounded font-medium">
        {label}
      </span>
    );
  });

  // Plain-text URLs
  if (!insideLink) {
    const urlified: (string | ReactNode)[] = [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (typeof part !== 'string') { urlified.push(part); continue; }
      urlified.push(...linkifyText(part, `p${i}`));
    }
    parts = urlified;
  }

  // Contract addresses -- AFTER all URL processing
  for (const addr of insideLink ? [] : contractAddresses) {
    const isEvm = addr.startsWith('0x');
    const color = isEvm ? (addressColors?.evm ?? '#fee75c') : (addressColors?.sol ?? '#14f195');
    const newParts: (string | ReactNode)[] = [];
    for (const part of parts) {
      if (typeof part !== 'string') { newParts.push(part); continue; }
      const splits = part.split(addr);
      for (let i = 0; i < splits.length; i++) {
        if (splits[i]) newParts.push(splits[i]);
        if (i < splits.length - 1) {
          newParts.push(
            <span
              key={`contract-${addr}-${i}`}
              className="px-1 rounded text-[13px] font-mono cursor-pointer inline-block max-w-full [overflow-wrap:anywhere] transition-opacity hover:opacity-80"
              style={{ backgroundColor: colorWithExtraAlpha(color, 0.125), color }}
              title={contractClickTitle(clickAction, addr)}
              onClick={() => handleContractClick(addr, clickAction, linkTemplates)}
            >
              {showFull ? addr : `${addr.slice(0, 6)}...${addr.slice(-4)}`}
            </span>
          );
        }
      }
    }
    parts = newParts;
  }

  return parts;
}

function renderInlineMarkdown(content: string, contractAddresses: string[], mentions: Record<string, string> = {}, addressColors?: AddressColors, linkTemplates: ContractLinkTemplates = DEFAULT_LINK_TEMPLATES, clickAction: ContractClickAction = 'copy_open', showFull: boolean = false): ReactNode[] {
  let parts: (string | ReactNode)[] = [content];

  // 1. Inline code (protect from other formatting)
  //    If the code content is a known contract address, render it as a clickable pill instead.
  parts = splitByRegex(parts, INLINE_CODE_REGEX, (m, i) => {
    const codeText = m[1];
    const matchedAddr = contractAddresses.find(a => codeText.trim() === a);
    if (matchedAddr) {
      const isEvm = matchedAddr.startsWith('0x');
      const color = isEvm ? (addressColors?.evm ?? '#fee75c') : (addressColors?.sol ?? '#14f195');
      return (
        <span
          key={`code-contract-${i}`}
          className="px-1 rounded text-[13px] font-mono cursor-pointer inline-block max-w-full [overflow-wrap:anywhere] transition-opacity hover:opacity-80"
          style={{ backgroundColor: colorWithExtraAlpha(color, 0.125), color }}
          title={contractClickTitle(clickAction, matchedAddr)}
          onClick={() => handleContractClick(matchedAddr, clickAction, linkTemplates)}
        >
          {showFull ? matchedAddr : `${matchedAddr.slice(0, 6)}...${matchedAddr.slice(-4)}`}
        </span>
      );
    }
    return (
      <code key={`code-${i}`} className="bg-discord-embed-bg px-1 py-0.5 rounded text-[0.85em] font-mono [overflow-wrap:anywhere]">
        {codeText}
      </code>
    );
  });

  // 2. Everything else -- bold and links first, so they can nest either way
  parts = applyInlineFormatting(parts, contractAddresses, mentions, addressColors, linkTemplates, clickAction, showFull);

  return parts as ReactNode[];
}

function renderContent(content: string, contractAddresses: string[], mentions: Record<string, string> = {}, addressColors?: AddressColors, linkTemplates: ContractLinkTemplates = DEFAULT_LINK_TEMPLATES, clickAction: ContractClickAction = 'copy_open', showFull: boolean = false) {
  if (!content) return null;

  // Extract code blocks first, replace with placeholders
  const codeBlocks: ReactNode[] = [];
  const withoutCodeBlocks = content.replace(CODE_BLOCK_REGEX, (_match, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(
      <pre key={`codeblock-${idx}`} className="bg-discord-embed-bg border border-discord-dark/50 rounded p-2 my-1 text-sm font-mono overflow-x-auto whitespace-pre-wrap [overflow-wrap:anywhere]">
        {/* The newline right after the opening fence (and before the closing
            one) belongs to the fence, not the code -- Discord eats both. */}
        <code>{code.replace(/^\n/, '').replace(/\n[ \t]*$/, '')}</code>
      </pre>
    );
    return `\x00CODEBLOCK_${idx}\x00`;
  });

  // Split into lines and group into quote blocks vs normal
  const lines = withoutCodeBlocks.split('\n');
  const result: ReactNode[] = [];
  let quoteBuffer: string[] = [];
  let lineKey = 0;

  function flushQuotes() {
    if (quoteBuffer.length === 0) return;
    const quoteContent = quoteBuffer.join('\n');
    result.push(
      <div key={`quote-${lineKey++}`} className="border-l-[3px] border-discord-text-muted/40 pl-3 my-1 compact:my-1.5 compact:py-0.5">
        {renderLineGroup(quoteContent, contractAddresses)}
      </div>
    );
    quoteBuffer = [];
  }

  /**
   * Text can sit on the same line as a code block -- call bots close the fence
   * around a contract address and put their link row (`GMGN | DEX · X`) right
   * after it, all on one line. Render every segment, not just the block.
   */
  function renderCodeBlockLine(line: string, contracts: string[], keyBase: string): ReactNode[] {
    const out: ReactNode[] = [];
    const re = /\x00CODEBLOCK_(\d+)\x00/g;
    let last = 0;
    let m: RegExpExecArray | null;
    const pushText = (text: string, at: number) => {
      if (!text.trim()) return;
      out.push(
        <Fragment key={`${keyBase}-t${at}`}>
          {renderInlineMarkdown(text, contracts, mentions, addressColors, linkTemplates, clickAction, showFull)}
        </Fragment>
      );
    };
    while ((m = re.exec(line)) !== null) {
      pushText(line.slice(last, m.index), last);
      out.push(codeBlocks[parseInt(m[1])]);
      last = m.index + m[0].length;
    }
    pushText(line.slice(last), last);
    return out;
  }

  /**
   * `# `/`## `/`### ` headings and `-# ` subtext are block-level: they own
   * their line, so they render as a block and skip the <br> a normal line
   * would need. Anything else returns null and flows inline as before.
   */
  function renderBlockLine(line: string, contracts: string[], keyBase: string): ReactNode | null {
    const heading = line.match(HEADING_REGEX);
    const subtext = heading ? null : line.match(SUBTEXT_REGEX);
    if (!heading && !subtext) return null;
    const inner = heading ? heading[2] : subtext![1];
    const className = heading
      ? HEADING_CLASSES[heading[1].length]
      : 'text-[0.8125rem] leading-[1.125rem] text-discord-text-muted';
    return (
      <div key={keyBase} className={className}>
        {renderInlineMarkdown(inner, contracts, mentions, addressColors, linkTemplates, clickAction, showFull)}
      </div>
    );
  }

  function renderLineGroup(text: string, contracts: string[]): ReactNode {
    const groupLines = text.split('\n');
    const parts: ReactNode[] = [];
    let afterBlock = false;
    for (let i = 0; i < groupLines.length; i++) {
      const block = renderBlockLine(groupLines[i], contracts, `qblk-${lineKey}-${i}`);
      if (block) {
        parts.push(block);
        afterBlock = true;
        continue;
      }
      if (i > 0 && !afterBlock) parts.push(<br key={`lbr-${lineKey}-${i}`} />);
      afterBlock = false;
      const placeholderMatch = groupLines[i].match(/\x00CODEBLOCK_(\d+)\x00/);
      if (placeholderMatch) {
        parts.push(...renderCodeBlockLine(groupLines[i], contracts, `qcb-${lineKey}-${i}`));
      } else {
        parts.push(...renderInlineMarkdown(groupLines[i], contracts, mentions, addressColors, linkTemplates, clickAction, showFull));
      }
    }
    return <>{parts}</>;
  }

  // Blank lines are paragraph breaks, not full empty text lines: a spacer the
  // height of one line on desktop (Discord's own rendering), tightened on
  // phones so a multi-paragraph Telegram message doesn't read as three
  // far-apart messages while grouped Discord messages sit 8px apart. Runs of
  // blank lines collapse into one break; trailing blanks are dropped.
  let pendingParagraph = false;
  // A block element (code block, heading, subtext) already ends its own line --
  // a <br> after it would open an empty one.
  let lastWasBlock = false;
  for (const line of lines) {
    if (line.startsWith('> ') || line === '>') {
      quoteBuffer.push(line.slice(2));
    } else {
      flushQuotes();
      // Check for code block placeholder
      const placeholderMatch = line.match(/\x00CODEBLOCK_(\d+)\x00/);
      if (!placeholderMatch && line.trim() === '') {
        pendingParagraph = result.length > 0;
        continue;
      }
      const block = placeholderMatch ? null : renderBlockLine(line, contractAddresses, `blk-${lineKey++}`);
      if (block) {
        result.push(block);
        pendingParagraph = false;
        lastWasBlock = true;
        continue;
      }
      if (placeholderMatch) {
        // Text ahead of the block continues the line above it; the block itself
        // is its own paragraph, so it needs no separator of its own.
        if (line.slice(0, placeholderMatch.index).trim()) {
          if (pendingParagraph) {
            result.push(<span key={`pbr-${lineKey++}`} aria-hidden="true" className="block h-[1.375rem] compact:h-1.5" />);
          } else if (result.length > 0 && !lastWasBlock) {
            result.push(<br key={`br-${lineKey++}`} />);
          }
        }
        pendingParagraph = false;
        lastWasBlock = true;
        result.push(...renderCodeBlockLine(line, contractAddresses, `cb-${lineKey++}`));
      } else {
        if (pendingParagraph) {
          result.push(<span key={`pbr-${lineKey++}`} aria-hidden="true" className="block h-[1.375rem] compact:h-1.5" />);
          pendingParagraph = false;
        } else if (result.length > 0 && !lastWasBlock) {
          result.push(<br key={`br-${lineKey++}`} />);
        }
        lastWasBlock = false;
        result.push(
          <Fragment key={`line-${lineKey++}`}>
            {renderInlineMarkdown(line, contractAddresses, mentions, addressColors, linkTemplates, clickAction, showFull)}
          </Fragment>
        );
      }
    }
  }
  flushQuotes();

  return <span>{result}</span>;
}

function splitByRegex(
  parts: (string | ReactNode)[],
  regex: RegExp,
  render: (match: RegExpExecArray, idx: number) => ReactNode,
): (string | ReactNode)[] {
  let counter = 0;
  const result: (string | ReactNode)[] = [];
  for (const part of parts) {
    if (typeof part !== 'string') { result.push(part); continue; }
    let lastIndex = 0;
    const re = new RegExp(regex.source, regex.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(part)) !== null) {
      if (m.index > lastIndex) result.push(part.slice(lastIndex, m.index));
      result.push(render(m, counter++));
      lastIndex = m.index + m[0].length;
    }
    if (lastIndex < part.length) result.push(part.slice(lastIndex));
  }
  return result;
}

function renderEmbedDescription(text: string, showFull: boolean = false, mentions: Record<string, string> = {}): ReactNode {
  return renderContent(text, detectAddresses(text), mentions, undefined, undefined, undefined, showFull);
}

function ReactionUserList({ users, loading, error }: { users: ReactionUser[]; loading: boolean; error: boolean }) {
  if (loading) return <div className="px-2 py-1.5 text-discord-text-muted">Loading…</div>;
  if (error) return <div className="px-2 py-1.5 text-red-400">Failed to load</div>;
  if (users.length === 0) return <div className="px-2 py-1.5 text-discord-text-muted">No users</div>;
  return (
    <div className="max-h-48 overflow-y-auto">
      {users.map((u) => (
        <div key={u.id} className="flex items-center gap-2 px-2 py-1">
          <img
            src={getAvatarUrl(u.id, u.avatar, u.discriminator)}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-5 h-5 rounded-full flex-shrink-0"
          />
          <span className="truncate text-discord-text">{u.displayName}</span>
        </div>
      ))}
    </div>
  );
}

function ReactionPills({ message }: { message: FrontendMessage }) {
  const reactions = message.reactions;
  // Only Discord exposes a per-user reaction list via the REST API.
  const clickable = message.source !== 'telegram';
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [users, setUsers] = useState<ReactionUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (openIndex === null) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenIndex(null);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [openIndex]);

  if (!reactions || reactions.length === 0) return null;

  const handleClick = async (index: number, emoji: FrontendReaction['emoji']) => {
    if (openIndex === index) {
      setOpenIndex(null);
      return;
    }
    setOpenIndex(index);
    setLoading(true);
    setError(false);
    setUsers([]);
    try {
      const result = await useAppStore.getState().fetchReactionUsers(message.channelId, message.id, emoji);
      setUsers(result);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div ref={containerRef} className="flex flex-wrap gap-1 mt-0.5">
      {reactions.map((r, i) => {
        const emojiContent = r.emoji.id ? (
          <img
            src={webpSafeUrl(`https://cdn.discordapp.com/emojis/${r.emoji.id}.${r.emoji.animated ? 'gif' : 'webp'}?size=16`)}
            alt={r.emoji.name}
            loading="lazy"
            decoding="async"
            className="w-4 h-4"
          />
        ) : (
          <span className="text-sm leading-none">{r.emoji.name}</span>
        );
        const pillInner = (
          <>
            {emojiContent}
            <span>{r.count}</span>
          </>
        );
        const pillClass = 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-discord-embed-bg text-discord-text-muted text-xs border border-transparent transition-colors';
        if (!clickable) {
          return (
            <span key={`${r.emoji.id ?? r.emoji.name}-${i}`} className={pillClass} title={r.emoji.name}>
              {pillInner}
            </span>
          );
        }
        return (
          <span key={`${r.emoji.id ?? r.emoji.name}-${i}`} className="relative">
            <button
              type="button"
              onClick={() => handleClick(i, r.emoji)}
              className={`${pillClass} cursor-pointer hover:border-discord-text-muted/30 ${openIndex === i ? 'border-discord-text-muted/50' : ''}`}
              title={`See who reacted with ${r.emoji.name}`}
            >
              {pillInner}
            </button>
            {openIndex === i && (
              <div className="absolute z-50 bottom-full mb-1 left-0 min-w-[10rem] max-w-[16rem] rounded-md border border-discord-border bg-discord-dark shadow-lg py-1 text-xs">
                <div className="px-2 pb-1 mb-1 border-b border-discord-border text-discord-text-muted flex items-center gap-1">
                  <span>Reacted with</span>
                  {emojiContent}
                </div>
                <ReactionUserList users={users} loading={loading} error={error} />
              </div>
            )}
          </span>
        );
      })}
    </div>
  );
}

// Sticker, poll, forward header and URL buttons. Originally Telegram-only,
// but native Discord polls and stickers are mapped into the same fields by
// the backend, so every block simply renders when its field is present.
function PlatformExtras({ message }: { message: FrontendMessage }) {
  return (
    <>
      {message.forwardFrom && (
        <div className="text-xs text-[#2AABEE] italic mt-0.5 mb-1">
          Forwarded from {message.forwardFrom.name}
          {message.forwardFrom.chatTitle && message.forwardFrom.chatTitle !== message.forwardFrom.name
            ? ` in ${message.forwardFrom.chatTitle}`
            : ''}
        </div>
      )}

      {message.sticker && (
        <div className="mt-1">
          {message.sticker.url ? (
            <img
              src={message.sticker.url}
              alt={message.sticker.emoji ?? 'sticker'}
              loading="lazy"
              decoding="async"
              className="w-32 h-32 object-contain"
            />
          ) : (
            <span className="text-4xl">{message.sticker.emoji ?? '🏷️'}</span>
          )}
        </div>
      )}

      {message.poll && (
        <div className="mt-1 border border-discord-divider rounded p-3 max-w-sm">
          <div className="text-sm font-semibold text-white mb-2">📊 {message.poll.question}</div>
          <div className="space-y-1.5">
            {message.poll.options.map((opt, i) => {
              const total = message.poll!.options.reduce((s, o) => s + o.voters, 0);
              const pct = total > 0 ? Math.round((opt.voters / total) * 100) : 0;
              return (
                <div key={i} className="relative">
                  <div
                    className="absolute inset-0 bg-[#2AABEE]/15 rounded"
                    style={{ width: `${pct}%` }}
                  />
                  <div className="relative flex items-center justify-between px-2 py-1.5 text-sm">
                    <span className="text-discord-text">{opt.text}</span>
                    <span className="text-discord-text-muted text-xs">{pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {message.buttons && message.buttons.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {message.buttons.map((btn, i) => (
            <a
              key={i}
              href={btn.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-2.5 py-1 rounded bg-[#2AABEE]/10 text-[#2AABEE] text-xs font-medium hover:bg-[#2AABEE]/20 transition-colors"
              title={btn.url}
            >
              {btn.text}
            </a>
          ))}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Discord message components (classic action rows + "Components v2").
// v2 messages (flag 1<<15) have empty content/embeds -- their entire body is
// this component tree -- so without this renderer they show as blank.
// Interactive elements (non-link buttons, select menus) render as disabled:
// Trenchcord reads the firehose, it doesn't drive bot interactions.
// ---------------------------------------------------------------------------

interface ComponentCtx {
  contractAddresses: string[];
  mentions: Record<string, string>;
  addrColors: AddressColors;
  templates: ContractLinkTemplates;
  clickAct: ContractClickAction;
  showFull: boolean;
  setLightboxSrc: (src: string | null) => void;
}

const BUTTON_STYLE_CLASSES: Record<number, string> = {
  1: 'bg-discord-blurple text-white',   // primary
  2: 'bg-[#4e5058] text-white',         // secondary
  3: 'bg-discord-green/90 text-white',  // success
  4: 'bg-red-500/90 text-white',        // danger
  5: 'bg-[#4e5058] text-white',         // link
  6: 'bg-discord-blurple text-white',   // premium
};

function ComponentEmoji({ emoji }: { emoji: NonNullable<MessageComponent['emoji']> }) {
  if (emoji.id) {
    return (
      <img
        src={webpSafeUrl(`https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? 'gif' : 'webp'}?size=16`)}
        alt={emoji.name ?? ''}
        loading="lazy"
        decoding="async"
        className="w-4 h-4"
      />
    );
  }
  return <span className="text-sm leading-none">{emoji.name}</span>;
}

function ComponentNode({ c, ctx }: { c: MessageComponent; ctx: ComponentCtx }) {
  switch (c.type) {
    case 1: // Action Row
      return (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {c.components?.map((child, i) => <ComponentNode key={i} c={child} ctx={ctx} />)}
        </div>
      );

    case 2: { // Button
      const cls = BUTTON_STYLE_CLASSES[c.style ?? 2] ?? BUTTON_STYLE_CLASSES[2];
      const inner = (
        <>
          {c.emoji && <ComponentEmoji emoji={c.emoji} />}
          {c.label && <span>{c.label}</span>}
        </>
      );
      if (c.url) {
        return (
          <a
            href={c.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium hover:opacity-80 transition-opacity ${cls}`}
            title={c.url}
          >
            {inner}
            <ExternalLink size={11} className="opacity-70" />
          </a>
        );
      }
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium opacity-50 cursor-not-allowed select-none ${cls}`}
          title="Interactive buttons only work in the Discord app"
        >
          {inner}
        </span>
      );
    }

    case 3: case 5: case 6: case 7: case 8: // Select menus
      return (
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-discord-embed-bg border border-discord-border text-discord-text-muted text-xs opacity-70 cursor-not-allowed select-none"
          title="Interactive menus only work in the Discord app"
        >
          {c.placeholder || 'Select an option'} ▾
        </span>
      );

    case 9: // Section: text stack with a thumbnail/button accessory on the right
      return (
        <div className="flex items-start gap-3 mt-0.5">
          <div className="flex-1 min-w-0">
            {c.components?.map((child, i) => <ComponentNode key={i} c={child} ctx={ctx} />)}
          </div>
          {c.accessory && (
            <div className="shrink-0">
              <ComponentNode c={c.accessory} ctx={ctx} />
            </div>
          )}
        </div>
      );

    case 10: { // Text Display: markdown, same pipeline as message content
      const text = c.content ?? '';
      if (!text) return null;
      const localAddrs = detectAddresses(text);
      const contracts = localAddrs.length > 0
        ? Array.from(new Set([...ctx.contractAddresses, ...localAddrs]))
        : ctx.contractAddresses;
      return (
        <div className="text-[0.9375rem] text-discord-text-normal leading-[1.375rem] mt-0.5 break-words select-text">
          {renderContent(text, contracts, ctx.mentions, ctx.addrColors, ctx.templates, ctx.clickAct, ctx.showFull)}
        </div>
      );
    }

    case 11: { // Thumbnail
      const url = c.media?.url;
      if (!url) return null;
      return (
        <img
          src={webpSafeUrl(url)}
          alt={c.description ?? ''}
          loading="lazy"
          decoding="async"
          className={`max-w-[80px] max-h-[80px] rounded cursor-pointer hover:opacity-90 transition-opacity ${c.spoiler ? 'blur-md' : ''}`}
          onClick={() => ctx.setLightboxSrc(webpSafeUrl(url))}
        />
      );
    }

    case 12: { // Media Gallery
      const items = (c.items ?? []).filter((item) => item?.media?.url);
      if (items.length === 0) return null;
      return (
        <div className="flex flex-wrap gap-1 mt-1">
          {items.map((item, i) => (
            <img
              key={i}
              src={webpSafeUrl(item.media.url)}
              alt={item.description ?? ''}
              loading="lazy"
              decoding="async"
              className={`rounded cursor-pointer hover:opacity-90 transition-opacity object-cover ${
                items.length > 1 ? 'max-w-[150px] max-h-[150px]' : 'max-w-full sm:max-w-[550px] max-h-[350px]'
              } ${item.spoiler ? 'blur-md' : ''}`}
              onClick={() => ctx.setLightboxSrc(webpSafeUrl(item.media.url))}
            />
          ))}
        </div>
      );
    }

    case 13: { // File
      const url = c.file?.url;
      if (!url) return null;
      let name = c.name;
      if (!name) {
        try {
          name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'file');
        } catch {
          name = 'file';
        }
      }
      return (
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-block text-discord-text-link hover:underline text-sm mt-1">
          {name}
        </a>
      );
    }

    case 14: // Separator
      return c.divider === false
        ? <div className={c.spacing === 2 ? 'h-4' : 'h-2'} />
        : <div className={`border-t border-discord-border/60 ${c.spacing === 2 ? 'my-3' : 'my-2'}`} />;

    case 17: // Container: accent-colored card, like an embed
      return (
        <div
          className="border-l-4 rounded bg-discord-embed-bg p-2 sm:p-3 max-w-full sm:max-w-[520px] mt-1"
          style={{ borderColor: c.accent_color != null ? `#${c.accent_color.toString(16).padStart(6, '0')}` : '#1e1f22' }}
        >
          {c.components?.map((child, i) => <ComponentNode key={i} c={child} ctx={ctx} />)}
        </div>
      );

    default:
      return null;
  }
}

function MessageComponents({ message, addrColors, templates, clickAct, showFull, setLightboxSrc }: {
  message: FrontendMessage;
  addrColors: AddressColors;
  templates: ContractLinkTemplates;
  clickAct: ContractClickAction;
  showFull: boolean;
  setLightboxSrc: (src: string | null) => void;
}) {
  if (!message.components || message.components.length === 0) return null;
  const ctx: ComponentCtx = {
    contractAddresses: message.contractAddresses,
    mentions: message.mentions,
    addrColors,
    templates,
    clickAct,
    showFull,
    setLightboxSrc,
  };
  return (
    <div className="min-w-0">
      {message.components.map((c, i) => <ComponentNode key={i} c={c} ctx={ctx} />)}
    </div>
  );
}

/**
 * Discord's client hides a message's text when it is nothing but media links
 * that all unfurled into image/gifv/video embeds (pasting a GIF or image URL
 * shows just the media, no blue link). Mirror that: every whitespace-separated
 * token must be a URL matching one of the message's media embeds.
 */
export function isMediaOnlyContent(content: string, embeds: FrontendMessage['embeds']): boolean {
  const trimmed = content.trim();
  if (!trimmed || embeds.length === 0) return false;
  const tokens = trimmed.split(/\s+/);
  if (!tokens.every((t) => /^https?:\/\/\S+$/i.test(t))) return false;
  const mediaUrls = new Set<string>();
  for (const e of embeds) {
    if ((e.type === 'image' || e.type === 'gifv' || e.type === 'video') && e.url) {
      mediaUrls.add(e.url.replace(/\/+$/, ''));
    }
  }
  if (mediaUrls.size === 0) return false;
  return tokens.every((t) => mediaUrls.has(t.replace(/\/+$/, '')));
}

/** Media embeds from a bare pasted link get no embed-card chrome, so they can
 * only ever be as big as the media itself -- render them Discord-sized. */
const EMBED_MEDIA_SIZE = 'max-w-full sm:max-w-[550px] max-h-[350px]';

/**
 * Neither Discord nor Telegram hand us a poster image for plain video
 * attachments, so an unplayed video is a black 0:00 box. preload="metadata"
 * plus this tiny seek fragment makes the browser decode and paint the first
 * frame as a stand-in thumbnail (the bare metadata fetch alone isn't enough
 * on Safari). Playback still starts at the beginning for the viewer.
 */
function firstFrameSrc(url: string): string {
  return url.includes('#') ? url : `${url}#t=0.001`;
}

/**
 * Never render embed media past the source's true size (Discord reports it on
 * the embed). Tenor/Giphy mp4s are upscaled blurs of a much smaller GIF, so
 * without this a 160px GIF-picker emoji balloons to the 550px cap; Discord
 * itself sizes these by the reported dimensions.
 */
function mediaSizeStyle(media?: { width?: number; height?: number }): React.CSSProperties | undefined {
  if (!media?.width || !media?.height) return undefined;
  return {
    maxWidth: `min(100%, ${Math.min(media.width, 550)}px)`,
    maxHeight: Math.min(media.height, 350),
  };
}

/**
 * Every attachment on a message: pictures inline, voice notes as a player
 * (Discord's own rendering -- a file link for a 4-minute recording is
 * useless), videos with controls, everything else as a download link.
 * Shared by all four message layouts and by forwarded bodies, which used to
 * render voice notes as bare `voice-message.ogg` links.
 */
function AttachmentList({ attachments, setLightboxSrc }: {
  attachments: FrontendMessage['attachments'];
  setLightboxSrc: (src: string | null) => void;
}) {
  if (attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-1">
      {attachments.map((att) =>
        att.content_type?.startsWith('image/') ? (
          <img
            key={att.id}
            src={webpSafeUrl(att.proxy_url)}
            alt={att.filename}
            loading="lazy"
            decoding="async"
            className="max-w-full sm:max-w-[550px] max-h-[350px] rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => setLightboxSrc(webpSafeUrl(att.proxy_url))}
          />
        ) : isVoiceAttachment(att) ? (
          <VoiceMessage key={att.id} att={att} />
        ) : att.content_type?.startsWith('audio/') ? (
          <div key={att.id} className="flex flex-col gap-1 max-w-full sm:max-w-[400px]">
            <audio controls preload="none" className="h-8 max-w-full">
              <source src={att.proxy_url} type={att.content_type} />
            </audio>
            <span className="text-[11px] compact:text-xs text-discord-text-muted truncate">{att.filename}</span>
          </div>
        ) : att.content_type?.startsWith('video/') ? (
          <video
            key={att.id}
            src={firstFrameSrc(webpSafeUrl(att.proxy_url))}
            controls
            preload="metadata"
            playsInline
            className="max-w-full sm:max-w-[550px] max-h-[350px] rounded-lg"
          />
        ) : (
          <a
            key={att.id}
            href={att.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-discord-text-link hover:underline text-sm"
          >
            {att.filename}
          </a>
        )
      )}
    </div>
  );
}

type EmbedImage = NonNullable<FrontendMessage['embeds'][number]['image']>;

/** The picture an embed shows full-size: `image`, or the `thumbnail` of an
 * image-type embed (a pasted image URL carries its media there). */
function mainImage(embed: FrontendMessage['embeds'][number]): EmbedImage | undefined {
  return embed.image ?? (embed.type === 'image' ? embed.thumbnail : undefined);
}

/**
 * A link that unfurls into several pictures (an X post with 2-4 images) arrives
 * as one embed per picture, all sharing the same `url`: the first carries the
 * text, the rest are bare images. Discord's client merges them back into one
 * card with an image grid -- rendering them as separate stacked cards fills the
 * whole pane with a single post. Group them back together here.
 */
function groupEmbeds(embeds: FrontendMessage['embeds']) {
  const groups: { embed: FrontendMessage['embeds'][number]; gallery: EmbedImage[] }[] = [];
  for (const embed of embeds) {
    const image = mainImage(embed);
    const prev = groups[groups.length - 1];
    const isExtraImage = !!image && !embed.title && !embed.description && !embed.author?.name
      && !(embed.fields && embed.fields.length > 0) && !embed.footer?.text && !embed.video;
    if (prev && isExtraImage && embed.url && prev.embed.url === embed.url && !prev.embed.video) {
      prev.gallery.push(image!);
    } else {
      groups.push({ embed, gallery: image ? [image] : [] });
    }
  }
  return groups;
}

/**
 * Discord's multi-image layout: two side by side, a big-left/two-right trio, or
 * a 2x2 grid, each picture cropped to its cell -- clicking one opens it whole.
 * Keeps a four-image post the height of one image instead of four.
 */
function EmbedGallery({ images, setLightboxSrc }: {
  images: EmbedImage[];
  setLightboxSrc: (src: string | null) => void;
}) {
  const rows = images.length === 2 ? 'h-[200px]'
    : images.length === 3 ? 'h-[300px] grid-rows-2'
    : 'auto-rows-[150px]';
  return (
    <div className={`grid grid-cols-2 gap-1 rounded overflow-hidden mt-2 max-w-full sm:max-w-[400px] ${rows}`}>
      {images.map((img, i) => {
        const src = webpSafeUrl(img.proxy_url ?? img.url);
        return (
          <img
            key={i}
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            className={`w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity${images.length === 3 && i === 0 ? ' row-span-2' : ''}`}
            onClick={() => setLightboxSrc(src)}
          />
        );
      })}
    </div>
  );
}

/**
 * Discord floats a rich embed's `thumbnail` as a small square to the RIGHT of
 * the text, not below it -- but only when the thumbnail isn't already serving
 * as the embed's main media (a video poster, a provider-video still, or the
 * picture of an image-type embed, all of which render full-size).
 */
function cornerThumbnail(embed: FrontendMessage['embeds'][number]) {
  if (!embed.thumbnail) return undefined;
  if (embed.video?.proxy_url || embed.video?.url) return undefined;
  if (embed.type === 'image') return undefined;
  return embed.thumbnail;
}

function CornerThumb({ thumb, setLightboxSrc, className = '' }: {
  thumb: NonNullable<FrontendMessage['embeds'][number]['thumbnail']>;
  setLightboxSrc: (src: string | null) => void;
  className?: string;
}) {
  const src = webpSafeUrl(thumb.proxy_url ?? thumb.url);
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      className={`max-w-[80px] max-h-[80px] rounded cursor-pointer hover:opacity-90 transition-opacity ${className}`}
      onClick={() => setLightboxSrc(src)}
    />
  );
}

/**
 * An embed's media area. Handles gifv (Tenor/Giphy: autoplaying looped mp4),
 * directly playable videos, provider videos (e.g. YouTube: thumbnail with a
 * play overlay linking out -- their URL is an iframe player, not a media
 * file), and the classic thumbnail/image fallbacks.
 */
function EmbedMedia({ embed, setLightboxSrc, skipCornerThumb, gallery }: {
  embed: FrontendMessage['embeds'][number];
  setLightboxSrc: (src: string | null) => void;
  /** The card already floated the corner thumbnail beside its text. */
  skipCornerThumb?: boolean;
  /** Pictures from this embed plus the sibling embeds merged into it. */
  gallery?: EmbedImage[];
}) {
  const videoUrl = embed.video?.proxy_url || embed.video?.url;
  const isGifv = embed.type === 'gifv';
  const isPlayable = !!videoUrl
    && (isGifv || !!embed.video?.proxy_url || /\.(mp4|webm|mov)(\?|$)/i.test(videoUrl));

  if (isPlayable) {
    return isGifv ? (
      <video
        src={videoUrl}
        autoPlay
        loop
        muted
        playsInline
        className={`${EMBED_MEDIA_SIZE} rounded mt-2`}
        style={mediaSizeStyle(embed.video)}
      />
    ) : (
      <video
        src={firstFrameSrc(videoUrl!)}
        controls
        preload={embed.thumbnail?.url ? 'none' : 'metadata'}
        playsInline
        poster={embed.thumbnail?.url}
        className={`${EMBED_MEDIA_SIZE} rounded mt-2`}
        style={mediaSizeStyle(embed.video)}
      />
    );
  }

  if (embed.video?.url && embed.thumbnail) {
    return (
      <a
        href={embed.url ?? embed.video.url}
        target="_blank"
        rel="noopener noreferrer"
        className="relative inline-block mt-2"
        title={embed.provider?.name ? `Watch on ${embed.provider.name}` : 'Watch video'}
      >
        <img
          src={webpSafeUrl(embed.thumbnail.url)}
          alt=""
          loading="lazy"
          decoding="async"
          className={`${EMBED_MEDIA_SIZE} rounded`}
          style={mediaSizeStyle(embed.thumbnail)}
        />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/75 transition-colors">
            <Play size={22} className="text-white ml-0.5" fill="currentColor" />
          </span>
        </span>
      </a>
    );
  }

  // Image-type embeds (a pasted image URL) carry the media in `thumbnail`;
  // it IS the image, so it renders full-size.
  const images = gallery?.length ? gallery : [mainImage(embed)].filter(Boolean) as EmbedImage[];
  const fullImage = images.length === 1 ? images[0] : undefined;
  // Card embeds float this beside their text instead; only a chrome-less media
  // embed (no title, no description) falls back to rendering it here.
  const smallThumb = skipCornerThumb ? undefined : cornerThumbnail(embed);

  return (
    <>
      {smallThumb && <CornerThumb thumb={smallThumb} setLightboxSrc={setLightboxSrc} className="mt-2" />}
      {images.length > 1 && <EmbedGallery images={images} setLightboxSrc={setLightboxSrc} />}
      {fullImage && (
        <img
          src={webpSafeUrl(fullImage.proxy_url ?? fullImage.url)}
          alt=""
          loading="lazy"
          decoding="async"
          className={`${EMBED_MEDIA_SIZE} rounded mt-2 cursor-pointer hover:opacity-90 transition-opacity`}
          style={mediaSizeStyle(fullImage)}
          onClick={() => setLightboxSrc(webpSafeUrl(fullImage.proxy_url ?? fullImage.url))}
        />
      )}
    </>
  );
}

/** One embed card, same look as the inline embed blocks in the layout branches. */
function EmbedCard({ embed, showFull, setLightboxSrc, mentions = {}, gallery }: {
  embed: FrontendMessage['embeds'][number];
  showFull: boolean;
  setLightboxSrc: (src: string | null) => void;
  mentions?: Record<string, string>;
  /** Pictures from the sibling embeds Discord merges into this one. */
  gallery?: EmbedImage[];
}) {
  // A pasted image/GIF/video link unfurls into a text-less media embed;
  // Discord renders those as bare media with no grey card around them.
  const isBareMedia =
    (embed.type === 'image' || embed.type === 'gifv' || embed.type === 'video')
    && !embed.title && !embed.description && !embed.author?.name
    && !(embed.fields && embed.fields.length > 0) && !embed.footer?.text;
  if (isBareMedia) {
    return <EmbedMedia embed={embed} setLightboxSrc={setLightboxSrc} gallery={gallery} />;
  }

  const cornerThumb = cornerThumbnail(embed);

  return (
    <div
      className="border-l-4 rounded bg-discord-embed-bg p-2 sm:p-3 max-w-full sm:max-w-[520px]"
      style={{ borderColor: embed.color ? `#${embed.color.toString(16).padStart(6, '0')}` : '#1e1f22' }}
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          {embed.author?.name && (
            <div className="flex items-center gap-2 mb-1">
              {embed.author.icon_url && (
                <img src={webpSafeUrl(embed.author.icon_url)} alt="" loading="lazy" decoding="async" className="w-6 h-6 rounded-full" />
              )}
              {embed.author.url ? (
                <a href={embed.author.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-white hover:underline">
                  {renderInlineMarkdown(embed.author.name, [], mentions)}
                </a>
              ) : (
                <span className="text-sm font-medium text-white">
                  {renderInlineMarkdown(embed.author.name, [], mentions)}
                </span>
              )}
            </div>
          )}
          {embed.title && (
            <div className="font-semibold text-sm">
              {embed.url ? (
                <a href={embed.url} target="_blank" rel="noopener noreferrer" className="hover:underline text-discord-text-link">
                  {renderInlineMarkdown(embed.title, [], mentions)}
                </a>
              ) : <span className="text-white">{renderInlineMarkdown(embed.title, [], mentions)}</span>}
            </div>
          )}
          {embed.description && (
            <div className="text-[13px] text-discord-text mt-1 leading-[1.125rem]">
              {renderEmbedDescription(embed.description, showFull, mentions)}
            </div>
          )}
          {embed.fields && embed.fields.length > 0 && (
            <div className="grid gap-y-1 gap-x-2 mt-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
              {embed.fields.map((field, fi) => (
                <div key={fi} className={field.inline ? '' : 'col-span-full'}>
                  <div className="text-xs font-semibold text-white mb-0.5">
                    {renderInlineMarkdown(field.name, [], mentions)}
                  </div>
                  <div className="text-[13px] text-discord-text leading-[1.125rem]">
                    {renderEmbedDescription(field.value, showFull, mentions)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {cornerThumb && <CornerThumb thumb={cornerThumb} setLightboxSrc={setLightboxSrc} className="shrink-0 mt-0.5" />}
      </div>
      <EmbedMedia embed={embed} setLightboxSrc={setLightboxSrc} skipCornerThumb gallery={gallery} />
      {(embed.footer?.text || embed.timestamp) && (
        <div className="flex items-center gap-2 mt-2 text-xs text-discord-text-muted">
          {embed.footer?.icon_url && (
            <img src={webpSafeUrl(embed.footer.icon_url)} alt="" loading="lazy" decoding="async" className="w-5 h-5 rounded-full" />
          )}
          <span>
            {embed.footer?.text}
            {embed.footer?.text && embed.timestamp && ' • '}
            {embed.timestamp && formatTimestamp(embed.timestamp)}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Discord-forwarded message body (message_snapshots). The outer message's
 * content is empty; everything the user cares about -- text, embeds, media,
 * components -- is in the snapshot, rendered here inside a quote-style block.
 */
function ForwardedBlock({ message, addrColors, templates, clickAct, showFull, setLightboxSrc }: {
  message: FrontendMessage;
  addrColors: AddressColors;
  templates: ContractLinkTemplates;
  clickAct: ContractClickAction;
  showFull: boolean;
  setLightboxSrc: (src: string | null) => void;
}) {
  const fwd = message.forwardedMessage;
  if (!fwd) return null;

  const localAddrs = detectAddresses(fwd.content);
  const contracts = localAddrs.length > 0
    ? Array.from(new Set([...message.contractAddresses, ...localAddrs]))
    : message.contractAddresses;
  const ctx: ComponentCtx = {
    contractAddresses: message.contractAddresses,
    mentions: message.mentions,
    addrColors,
    templates,
    clickAct,
    showFull,
    setLightboxSrc,
  };

  return (
    <div className="border-l-[3px] border-discord-text-muted/40 pl-3 mt-0.5 mb-0.5">
      <div className="flex items-center gap-1 text-xs text-discord-text-muted italic mb-0.5 select-none">
        <Forward size={12} />
        <span>Forwarded</span>
        {fwd.timestamp && (
          <span className="not-italic opacity-70">
            · {new Date(fwd.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {fwd.content && !isMediaOnlyContent(fwd.content, fwd.embeds) && (
        <div className="text-[0.9375rem] text-discord-text-normal leading-[1.375rem] break-words select-text">
          {renderContent(fwd.content, contracts, message.mentions, addrColors, templates, clickAct, showFull)}
        </div>
      )}

      <AttachmentList attachments={fwd.attachments} setLightboxSrc={setLightboxSrc} />

      {fwd.embeds.length > 0 && (
        <div className="flex flex-col gap-2 mt-1">
          {groupEmbeds(fwd.embeds).map(({ embed, gallery }, i) => (
            <EmbedCard key={i} embed={embed} gallery={gallery} showFull={showFull} setLightboxSrc={setLightboxSrc} mentions={message.mentions} />
          ))}
        </div>
      )}

      {fwd.components && fwd.components.length > 0 && (
        <div className="min-w-0">
          {fwd.components.map((c, i) => <ComponentNode key={i} c={c} ctx={ctx} />)}
        </div>
      )}
    </div>
  );
}

// Discord marks ephemeral messages (flag 1<<6) with this footer; without it
// they're indistinguishable from normal chat even though nobody else saw them.
function EphemeralNote() {
  return (
    <div className="flex items-center gap-1 mt-0.5 text-[11px] compact:text-xs text-discord-text-muted select-none">
      <Eye size={12} className="shrink-0" />
      <span>Only you can see this</span>
    </div>
  );
}

/**
 * "marc used /pf callouts" -- the slash command a bot message answers.
 *
 * Sits directly above the message, where Discord puts it: a bot embed that only
 * makes sense as an answer ("Page 1 of 6" callouts) otherwise arrives with no
 * hint of who asked or what for. Clicking the command copies it, so the same
 * call can be fired again from Discord in one paste.
 *
 * Discord ships the command name but not the arguments it was invoked with;
 * pointing at the line fetches them the same lazy way the official client
 * fills its command tooltip -- one request, only for messages the user
 * actually hovers (a tap fires it too, for screens with no hover).
 */
function InteractionHeader({ interaction, channelId, messageId, dense = false }: {
  interaction: NonNullable<FrontendMessage['interaction']>;
  channelId?: string;
  messageId?: string;
  dense?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const command = `/${interaction.name}${interaction.args ? ` ${interaction.args}` : ''}`;

  const resolveArgs = () => {
    if (interaction.args !== undefined || !channelId || !messageId) return;
    useAppStore.getState().fetchInteractionArgs(channelId, messageId);
  };

  const copyCommand = () => {
    resolveArgs();
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      onMouseEnter={resolveArgs}
      className={`flex items-center gap-1.5 text-discord-text-muted mb-0.5 max-w-full overflow-hidden ${
        dense ? 'text-xs' : 'text-sm mt-0.5'
      }`}
    >
      <div className="w-8 h-3 border-l-2 border-t-2 border-discord-text-muted/30 rounded-tl ml-1 shrink-0" />
      {interaction.user.id && (
        <img
          src={getAvatarUrl(interaction.user.id, interaction.user.avatar)}
          alt=""
          loading="lazy"
          decoding="async"
          className={`rounded-full shrink-0 ${dense ? 'w-3.5 h-3.5' : 'w-4 h-4'}`}
        />
      )}
      <span className="font-medium shrink-0">{interaction.user.displayName}</span>
      <span className="opacity-70 shrink-0">used</span>
      <span
        onClick={copyCommand}
        title={`${command} — click to copy`}
        className="min-w-0 truncate font-medium text-discord-text-link cursor-pointer hover:underline select-text"
      >
        {command}
      </span>
      {copied && <span className="text-discord-green shrink-0">copied</span>}
    </div>
  );
}

/**
 * Discord's APP tag. Everything an app posts wears it, so a bot message is
 * never mistaken for a person's.
 */
export function AppTag({ dense }: { dense?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-[1px] rounded bg-discord-blurple text-white font-semibold align-middle self-center shrink-0 ${
        dense ? 'text-[9px] px-1 leading-[15px]' : 'text-[10px] px-1 leading-4'
      }`}
      title="This message is from an app"
    >
      <Check size={dense ? 8 : 9} strokeWidth={4} className="shrink-0" />
      APP
    </span>
  );
}

/**
 * The reply spine: who is being replied to, and a one-line preview of what
 * they said. Clicking it jumps to the original. A media-only message has no
 * text to quote, so it reads "Click to see attachment" the way Discord renders
 * one.
 */
function ReplyPreview({ reference, authorName, addrColors, roleColors, dense }: {
  reference: NonNullable<FrontendMessage['referencedMessage']>;
  authorName: string;
  addrColors: AddressColors;
  roleColors: boolean;
  dense?: boolean;
}) {
  const jumpToOriginal = () => {
    const el = document.getElementById(`msg-${reference.id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const flash = dense ? 'bg-discord-hover' : 'bg-discord-blurple/10';
    el.classList.add(flash);
    setTimeout(() => el.classList.remove(flash), 2000);
  };

  return (
    <div
      className={`flex items-center text-discord-text-muted mb-0.5 max-w-full overflow-hidden cursor-pointer hover:text-discord-text-normal ${
        dense ? 'gap-1 text-xs' : 'gap-1.5 text-sm mt-0.5'
      }`}
      onClick={jumpToOriginal}
    >
      <div className="w-8 h-3 border-l-2 border-t-2 border-discord-text-muted/30 rounded-tl ml-1 shrink-0" />
      <img
        src={getAvatarUrl(reference.authorId ?? reference.id, reference.avatar ?? null)}
        alt=""
        loading="lazy"
        decoding="async"
        className={`rounded-full shrink-0 ${dense ? 'w-3.5 h-3.5' : 'w-4 h-4'}`}
      />
      {reference.isBot && <AppTag dense />}
      <span
        className="font-medium shrink-0 truncate max-w-[45%]"
        style={roleColors && reference.roleColor ? { color: reference.roleColor } : undefined}
      >
        @{authorName}
      </span>
      {reference.hasAttachment ? (
        <span className="flex items-center gap-1 italic opacity-70 min-w-0">
          <span className="truncate">Click to see attachment</span>
          <ImageIcon size={dense ? 11 : 12} className="shrink-0" />
        </span>
      ) : (
        <span className="truncate opacity-70">
          {renderInlineMarkdown(reference.content, [], reference.mentions ?? {}, addrColors)}
        </span>
      )}
    </div>
  );
}

function DeletedBadge() {
  return (
    <span
      className="text-[10px] compact:text-[11px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-semibold uppercase tracking-wide align-middle self-center"
      title="This message was deleted on the platform"
    >
      deleted
    </span>
  );
}

// Snipe outcome badge, shown on message copies in the virtual "snipes" feed.
function SnipeBadge({ info }: { info: NonNullable<FrontendMessage['snipeInfo']> }) {
  const shortMint = `${info.mint.slice(0, 4)}…${info.mint.slice(-4)}`;
  const label =
    info.status === 'bought'
      ? `SNIPED ${info.solAmount} SOL${info.walletsTotal > 1 ? ` (${info.walletsOk}/${info.walletsTotal})` : ''}`
      : info.status === 'skipped'
        ? 'SNIPE SKIPPED'
        : 'SNIPE FAILED';
  const cls =
    info.status === 'bought'
      ? 'bg-discord-green/20 text-discord-green'
      : info.status === 'skipped'
        ? 'bg-orange-400/20 text-orange-400'
        : 'bg-red-500/20 text-red-400';
  const title = [
    `${info.configName || 'Snipe'} · ${shortMint}`,
    info.reason,
  ].filter(Boolean).join(' — ');
  return (
    <span className={`text-[10px] compact:text-[11px] px-1.5 py-0.5 rounded font-semibold align-middle self-center ${cls}`} title={title}>
      {label}
      {info.configName ? <span className="opacity-70 font-medium"> · {info.configName}</span> : null}
    </span>
  );
}

function EditedIndicator({ message, addrColors, templates, clickAct, showFull }: {
  message: FrontendMessage;
  addrColors: AddressColors;
  templates: ContractLinkTemplates;
  clickAct: ContractClickAction;
  showFull: boolean;
}) {
  const [showOriginal, setShowOriginal] = useState(false);
  if (!message.isEdited) return null;
  const hasOriginal = message.originalContent !== undefined && message.originalContent !== '';

  return (
    <>
      <span
        onClick={hasOriginal ? () => setShowOriginal((v) => !v) : undefined}
        className={`text-[10px] text-discord-text-muted ml-1 align-baseline select-none${hasOriginal ? ' cursor-pointer hover:underline' : ''}`}
        title={hasOriginal ? (showOriginal ? 'Hide original message' : 'Show original message') : 'Original message unavailable'}
      >
        (edited)
      </span>
      {showOriginal && hasOriginal && (
        <div className="mt-1 border-l-2 border-discord-text-muted/40 pl-2 text-[13px] text-discord-text-muted">
          <div className="text-[10px] uppercase tracking-wide text-discord-text-muted/70 mb-0.5">Original</div>
          {renderContent(message.originalContent!, detectAddresses(message.originalContent!), message.mentions, addrColors, templates, clickAct, showFull)}
        </div>
      )}
    </>
  );
}

function Message({ message, isCompact, messageDisplay = 'default', compactModeAvatars = true, compactModeNameOnce = false, guildColor, highlightMode = 'background', highlightColor, disableEmbeds, evmAddressColor, solAddressColor, contractLinkTemplates, contractClickAction, showFullContractAddress = false, openInDiscordApp, openInTelegramApp, badgeClickAction, serverIconBadge, guildIcon, customUserNames, onRenameUser, onHideUser, onHideRole, onToggleHighlightRole, highlightedRoleIds, onToggleHighlight, isUserHighlighted, isRoleHighlighted, onFocus, isFocused, onQuickReply, onDismiss, chattingEnabled, roleColors = true }: MessageProps) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const addrColors: AddressColors = { evm: evmAddressColor ?? '#fee75c', sol: solAddressColor ?? '#14f195' };
  const templates: ContractLinkTemplates = contractLinkTemplates ?? DEFAULT_LINK_TEMPLATES;
  const clickAct: ContractClickAction = contractClickAction ?? 'copy_open';
  const showFull = showFullContractAddress;
  // Media-only messages (just a pasted GIF/image link): drop the raw link and
  // show only the unfurled media, like Discord. Kept when embeds are disabled
  // for this room -- hiding it then would leave the message empty.
  const displayContent = !disableEmbeds && isMediaOnlyContent(message.content, message.embeds)
    ? ''
    : message.content;
  const [copied, setCopied] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; anchorTop?: number } | null>(null);

  const customName = customUserNames?.[message.author.id];
  const authorName = customName ?? message.author.displayName;
  const refAuthorName = message.referencedMessage
    ? ((message.referencedMessage.authorId ? customUserNames?.[message.referencedMessage.authorId] : undefined)
        ?? message.referencedMessage.author)
    : '';

  const copyUserId = () => {
    navigator.clipboard.writeText(message.author.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleNameClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setContextMenu({ x: rect.left, y: rect.bottom + 4, anchorTop: rect.top - 4 });
  };

  const useUsernameHighlight = highlightMode === 'username';
  const hasKeywordMatch = (message.matchedKeywords?.length ?? 0) > 0;
  const resolvedHighlightColor = highlightColor || '#5865f2';
  const hasCustomColor = !!highlightColor;
  const effectiveHighlighted = message.isHighlighted || isUserHighlighted || isRoleHighlighted;
  // Role-sourced highlights style the row only; the username keeps its role
  // color. Only a highlight on the user themselves recolors the name.
  // (message.isHighlighted also covers role matches on the backend, hence the
  // !isRoleHighlighted guard.)
  const nameHighlighted = isUserHighlighted || (message.isHighlighted && !isRoleHighlighted);

  const highlightClass = effectiveHighlighted
    ? useUsernameHighlight
      ? hasCustomColor ? 'border-l-2' : 'border-l-2 border-discord-blurple'
      : hasCustomColor ? 'border-l-2' : 'border-l-2 border-discord-blurple bg-discord-highlight'
    : hasKeywordMatch
      ? 'border-l-2 border-orange-400 bg-orange-400/5'
      : '';

  const highlightInlineStyle: React.CSSProperties = {};
  if (effectiveHighlighted && hasCustomColor) {
    highlightInlineStyle.borderColor = resolvedHighlightColor;
    if (!useUsernameHighlight) {
      highlightInlineStyle.backgroundColor = colorWithExtraAlpha(resolvedHighlightColor, 0.082);
    }
  }

  const bgStyle = guildColor ? { backgroundColor: guildColor, ...highlightInlineStyle } : highlightInlineStyle;

  const isTelegram = message.source === 'telegram';

  // On iOS the web targets are useless (Discord/Telegram web nag-screens in
  // Safari), so the native apps are always preferred regardless of the
  // desktop-oriented settings. The shell hands the URL to the OS.
  const useDiscordApp = openInDiscordApp || isIOSApp();
  const useTelegramApp = openInTelegramApp || isIOSApp();

  const discordPath = `discord.com/channels/${message.guildId ?? '@me'}/${message.channelId}/${message.id}`;
  const discordUrl = useDiscordApp ? `discord://${discordPath}` : `https://${discordPath}`;
  const webTelegramUrl = message.platformUrl ?? null;
  const telegramUrl = (() => {
    if (!webTelegramUrl) return null;
    if (!useTelegramApp) return webTelegramUrl;
    const inviteMatch = webTelegramUrl.match(/^https:\/\/t\.me\/(?:joinchat\/|\+)(.+)$/);
    if (inviteMatch) return `tg://join?invite=${inviteMatch[1]}`;
    const privateMatch = webTelegramUrl.match(/^https:\/\/t\.me\/c\/(\d+)\/(\d+)$/);
    if (privateMatch) return `tg://privatepost?channel=${privateMatch[1]}&post=${privateMatch[2]}`;
    const publicMatch = webTelegramUrl.match(/^https:\/\/t\.me\/([^/]+)\/(\d+)$/);
    if (publicMatch) return `tg://resolve?domain=${publicMatch[1]}&post=${publicMatch[2]}`;
    return webTelegramUrl;
  })();
  const badgeAct: BadgeClickAction = badgeClickAction ?? 'discord';

  const openSourcePlatform = () => {
    if (isTelegram && telegramUrl) {
      if (useTelegramApp) {
        window.location.href = telegramUrl;
      } else {
        window.open(telegramUrl, '_blank', 'noopener,noreferrer');
      }
    } else if (!isTelegram) {
      if (useDiscordApp) {
        window.location.href = discordUrl;
      } else {
        window.open(discordUrl, '_blank', 'noopener,noreferrer');
      }
    }
  };

  const handleBadgeClick = () => {
    const hasContract = message.hasContractAddress && message.contractAddresses.length > 0;
    const openPlatform = () => {
      if (hasContract) {
        const addr = message.contractAddresses[0];
        const evmChain = useAppStore.getState().addressChains[addr.toLowerCase()];
        const url = buildContractUrl(addr, templates, evmChain);
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    };

    switch (badgeAct) {
      case 'platform':
        if (hasContract) openPlatform();
        else openSourcePlatform();
        break;
      case 'both':
        openSourcePlatform();
        if (hasContract) openPlatform();
        break;
      case 'discord':
      default:
        openSourcePlatform();
        break;
    }
  };

  const channelLabel = isTelegram
    ? message.channelName
    : `${message.guildName ? `${message.guildName} / ` : ''}#${message.channelName}`;

  // Icon-style badge: server image + #channel, like Discord's own channel
  // pills. A guild without an icon gets its name's acronym in a circle; DMs
  // (no guild) keep the text label. The hidden server name moves to the title.
  const useIconBadge = !!serverIconBadge && !isTelegram && !!message.guildId;
  const discordBadgeContent = useIconBadge ? (
    <>
      {guildIcon ? (
        <img
          src={webpSafeUrl(`https://cdn.discordapp.com/icons/${message.guildId}/${guildIcon}.webp?size=32`)}
          alt=""
          loading="lazy"
          decoding="async"
          className="w-4 h-4 rounded-full shrink-0"
        />
      ) : (
        <span className="w-4 h-4 rounded-full bg-discord-dark text-[7px] font-semibold flex items-center justify-center shrink-0">
          {(message.guildName ?? '').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 3) || '?'}
        </span>
      )}
      <span className="truncate max-w-[140px]">#{message.channelName}</span>
    </>
  ) : channelLabel;
  const discordBadgeClass = `text-[0.6875rem] compact:text-xs px-1.5 py-0.5 rounded bg-discord-embed-bg text-discord-text-muted font-medium shrink-0 hover:text-discord-text hover:bg-discord-dark transition-colors cursor-pointer align-middle self-center${useIconBadge ? ' inline-flex items-center gap-1' : ''}`;
  const discordBadgeTitle = `${useIconBadge && message.guildName ? `${message.guildName} — ` : ''}Open in Discord${useDiscordApp ? ' app' : ''}`;

  const channelBadge = isTelegram ? (
    <span
      onClick={telegramUrl ? openSourcePlatform : undefined}
      className={`text-[0.6875rem] compact:text-xs px-1.5 py-0.5 rounded bg-[#2AABEE]/10 text-[#2AABEE] font-medium shrink-0 align-middle self-center${telegramUrl ? ' cursor-pointer hover:bg-[#2AABEE]/20 transition-colors' : ''}`}
      title={telegramUrl ? 'Open in Telegram' : 'Telegram'}
    >
      TG &middot; {channelLabel}
    </span>
  ) : useDiscordApp ? (
    <span
      onClick={() => { window.location.href = discordUrl; }}
      className={discordBadgeClass}
      title={discordBadgeTitle}
    >
      {discordBadgeContent}
    </span>
  ) : (
    <a
      href={discordUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={discordBadgeClass}
      title={discordBadgeTitle}
    >
      {discordBadgeContent}
    </a>
  );

  // DMs across several Discord accounts: which account this DM landed on.
  // The backend only sets receiverName when more than one token is configured.
  const receiverBadge = message.receiverName ? (
    <span
      className="text-[0.6875rem] compact:text-xs px-1.5 py-0.5 rounded bg-discord-blurple/10 text-discord-blurple font-medium shrink-0 align-middle self-center"
      title={`Received by ${message.receiverName}`}
    >
      &rarr; {message.receiverName}
    </span>
  ) : null;

  // Per-message clear, for the feeds that hand one out (see onDismiss). Sits in
  // the row's right gutter; the group class differs per layout below, and touch
  // layouts keep it visible since there is no hover there.
  const dismissButton = (groupHover: string) =>
    onDismiss ? (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        className={`absolute right-0 top-0 z-20 p-1 compact:p-2 rounded text-discord-text-muted/70 hover:text-discord-red hover:bg-discord-hover/60 transition-opacity opacity-100 sm:opacity-0 ${groupHover}`}
        title="Clear this message from the feed"
      >
        <X size={14} className="compact:w-[18px] compact:h-[18px]" />
      </button>
    ) : null;

  if (messageDisplay === 'compact') {
    return (
      <div className={`group/compact relative hover:bg-discord-hover py-[1px] compact:py-[6px] ${onDismiss ? 'pr-9' : 'pr-2'} sm:pr-[48px] pl-[52px] sm:pl-[72px] ${highlightClass} ${message.isDeleted ? 'opacity-60' : ''} min-h-[1.375rem]`} style={bgStyle}>
        {dismissButton('sm:group-hover/compact:opacity-100')}
        <span className={`absolute left-0 w-[52px] sm:w-[72px] text-[0.6875rem] compact:text-xs text-discord-text-muted text-right pr-2 sm:pr-4 pt-[1px] select-none leading-[1.375rem] ${isCompact ? 'opacity-0 group-hover/compact:opacity-100' : ''}`}>
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        <div className="min-w-0">
          {message.interaction && <InteractionHeader interaction={message.interaction} channelId={message.channelId} messageId={message.id} dense />}
          {message.referencedMessage && (
            <ReplyPreview
              reference={message.referencedMessage}
              authorName={refAuthorName}
              addrColors={addrColors}
              roleColors={roleColors}
              dense
            />
          )}

          <div className="text-[0.9375rem] text-discord-text-normal leading-[1.375rem] compact:leading-6 break-words select-text">
            {!(compactModeNameOnce && isCompact) && (
              <>
                {compactModeAvatars && (
                  !isCompact ? (
                    <img
                      src={getAvatarUrl(message.author.id, message.author.avatar)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="inline-block w-5 h-5 rounded-full mr-1 align-text-bottom"
                    />
                  ) : (
                    // Grouped follow-up: reserve the avatar's width so the
                    // author name lines up with the first message of the group.
                    <span aria-hidden="true" className="inline-block w-5 mr-1" />
                  )
                )}
                <span
                  className="font-medium text-[0.9375rem] hover:underline cursor-pointer mr-1"
                  style={{ color: nameHighlighted ? resolvedHighlightColor : (roleColors && message.author.roleColor ? message.author.roleColor : '#f2f3f5') }}
                  onClick={handleNameClick}
                  title={`${message.author.username} (${message.author.id})`}
                >
                  {authorName}
                  {copied && (
                    <span className="absolute -top-6 left-0 text-[10px] bg-discord-dark text-discord-green px-1.5 py-0.5 rounded shadow-lg whitespace-nowrap pointer-events-none">
                      ID copied!
                    </span>
                  )}
                </span>
                {message.author.isBot && (
                  <>
                    <AppTag dense />
                    {' '}
                  </>
                )}
                {channelBadge}
                {receiverBadge}
                <span className={`hidden sm:inline-flex items-center gap-0.5 align-middle transition-opacity ${isFocused ? 'opacity-100' : 'opacity-0 group-hover/compact:opacity-100'}`}>
                  <button
                    onClick={() => onFocus?.(message.guildId, message.channelId, message.guildName, message.channelName)}
                    className={`p-0.5 rounded transition-colors ${
                      isFocused
                        ? 'text-discord-blurple'
                        : 'text-discord-text-muted hover:text-white hover:bg-discord-hover/50'
                    }`}
                    title={isFocused ? 'Focused on this channel' : 'Focus on this channel'}
                  >
                    <Eye size={13} />
                  </button>
                  {chattingEnabled && (
                    <button
                      onClick={() => onQuickReply?.(message.channelId)}
                      className="p-0.5 rounded text-discord-text-muted hover:text-discord-green hover:bg-discord-hover/50 transition-colors"
                      title="Quick reply to this channel"
                    >
                      <MessageSquareReply size={13} />
                    </button>
                  )}
                </span>
                {' '}
              </>
            )}
            {message.hasContractAddress && (
              <>
                <span
                  onClick={handleBadgeClick}
                  className="text-[10px] compact:text-[11px] px-1.5 py-0.5 rounded bg-discord-yellow/20 text-discord-yellow font-semibold cursor-pointer hover:bg-discord-yellow/30 transition-colors align-middle"
                  title={badgeAct === 'platform' ? 'Open in trading platform' : badgeAct === 'both' ? 'Open in Discord + platform' : 'Open in Discord'}
                >
                  CONTRACT
                </span>
                {' '}
              </>
            )}
            {hasKeywordMatch && (
              <>
                <span
                  onClick={handleBadgeClick}
                  className="text-[10px] compact:text-[11px] px-1.5 py-0.5 rounded bg-orange-400/20 text-orange-400 font-semibold cursor-pointer hover:bg-orange-400/30 transition-colors align-middle"
                  title={badgeAct === 'platform' && message.hasContractAddress ? 'Open in trading platform' : badgeAct === 'both' && message.hasContractAddress ? 'Open in Discord + platform' : 'Open in Discord'}
                >
                  {message.matchedKeywords!.join(', ')}
                </span>
                {' '}
              </>
            )}
            {message.snipeInfo && (
              <>
                <SnipeBadge info={message.snipeInfo} />
                {' '}
              </>
            )}
            {message.isDeleted && (
              <>
                <DeletedBadge />
                {' '}
              </>
            )}
            {renderContent(displayContent, message.contractAddresses, message.mentions, addrColors, templates, clickAct, showFull)}
            <EditedIndicator message={message} addrColors={addrColors} templates={templates} clickAct={clickAct} showFull={showFull} />
          </div>

          <AttachmentList attachments={message.attachments} setLightboxSrc={setLightboxSrc} />

          {message.embeds.length > 0 && !disableEmbeds && (
            <div className="flex flex-col gap-2 mt-1">
              {groupEmbeds(message.embeds).map(({ embed, gallery }, i) => (
                <EmbedCard key={i} embed={embed} gallery={gallery} showFull={showFull} setLightboxSrc={setLightboxSrc} mentions={message.mentions} />
              ))}
            </div>
          )}

          <ForwardedBlock message={message} addrColors={addrColors} templates={templates} clickAct={clickAct} showFull={showFull} setLightboxSrc={setLightboxSrc} />
          <MessageComponents message={message} addrColors={addrColors} templates={templates} clickAct={clickAct} showFull={showFull} setLightboxSrc={setLightboxSrc} />
          <PlatformExtras message={message} />
          <ReactionPills message={message} />
          <TradeButtons message={message} dense />
          {message.isEphemeral && <EphemeralNote />}
        </div>

        {lightboxSrc && (
          <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
        )}

        {contextMenu && (
          <UserContextMenu
            userId={message.author.id}
            displayName={message.author.displayName}
            customName={customName}
            onRename={onRenameUser ? (name) => onRenameUser(message.author.id, name) : undefined}
            guildId={message.guildId}
            channelId={message.channelId}
            channelName={message.channelName}
            guildName={message.guildName}
            openInDiscordApp={openInDiscordApp ?? true}
            position={contextMenu}
            isHighlighted={isUserHighlighted}
            onToggleHighlight={onToggleHighlight ? () => {
              const highlightKey = isTelegram && message.author.username ? `@${message.author.username}` : message.author.id;
              onToggleHighlight(highlightKey, authorName);
            } : undefined}
            onHide={() => onHideUser?.(message.guildId, message.channelId, message.author.id, authorName)}
            authorRoles={message.author.roles}
            onHideRole={onHideRole && message.guildId ? (roleId, roleName) => onHideRole(message.guildId!, roleId, roleName) : undefined}
            onToggleHighlightRole={onToggleHighlightRole && message.guildId ? (roleId, roleName) => onToggleHighlightRole(message.guildId!, roleId, roleName) : undefined}
            highlightedRoleIds={highlightedRoleIds}
            onCopyId={copyUserId}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
    );
  }

  if (isCompact) {
    return (
      <div className={`group/compact relative hover:bg-discord-hover py-[2px] compact:py-[3px] ${onDismiss ? 'pr-9' : 'pr-2'} sm:pr-[48px] pl-[52px] sm:pl-[72px] ${highlightClass} ${message.isDeleted ? 'opacity-60' : ''} min-h-[1.375rem]`} style={bgStyle}>
        {dismissButton('sm:group-hover/compact:opacity-100')}
        <span className="absolute left-0 w-[52px] sm:w-[72px] text-[0.6875rem] compact:text-xs text-discord-text-muted text-right pr-2 sm:pr-4 pt-[2px] opacity-0 group-hover/compact:opacity-100 select-none leading-[1.375rem]">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        <div className="min-w-0">
          {message.interaction && <InteractionHeader interaction={message.interaction} channelId={message.channelId} messageId={message.id} dense />}
          {message.referencedMessage && (
            <ReplyPreview
              reference={message.referencedMessage}
              authorName={refAuthorName}
              addrColors={addrColors}
              roleColors={roleColors}
              dense
            />
          )}

          <div className="text-base text-discord-text-normal leading-[1.375rem] compact:leading-6 break-words select-text">
            {message.isDeleted && (
              <>
                <DeletedBadge />
                {' '}
              </>
            )}
            {renderContent(displayContent, message.contractAddresses, message.mentions, addrColors, templates, clickAct, showFull)}
            <EditedIndicator message={message} addrColors={addrColors} templates={templates} clickAct={clickAct} showFull={showFull} />
          </div>

          <AttachmentList attachments={message.attachments} setLightboxSrc={setLightboxSrc} />

          {message.embeds.length > 0 && !disableEmbeds && (
            <div className="flex flex-col gap-2 mt-1">
              {groupEmbeds(message.embeds).map(({ embed, gallery }, i) => (
                <EmbedCard key={i} embed={embed} gallery={gallery} showFull={showFull} setLightboxSrc={setLightboxSrc} mentions={message.mentions} />
              ))}
            </div>
          )}

          <ForwardedBlock message={message} addrColors={addrColors} templates={templates} clickAct={clickAct} showFull={showFull} setLightboxSrc={setLightboxSrc} />
          <MessageComponents message={message} addrColors={addrColors} templates={templates} clickAct={clickAct} showFull={showFull} setLightboxSrc={setLightboxSrc} />
          <PlatformExtras message={message} />
          <ReactionPills message={message} />
          <TradeButtons message={message} dense />
          {message.isEphemeral && <EphemeralNote />}
        </div>

        {lightboxSrc && (
          <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
        )}
      </div>
    );
  }

  return (
    <div className={`relative hover:bg-discord-hover pt-[1.0625rem] compact:pt-5 pb-[2px] compact:pb-1 pr-2 sm:pr-[48px] pl-[52px] sm:pl-[72px] ${highlightClass} ${message.isDeleted ? 'opacity-60' : ''} group`} style={bgStyle}>
      {dismissButton('sm:group-hover:opacity-100 hidden sm:block')}
      <div className={`absolute right-0 top-0.5 flex items-center rounded px-0.5 py-0.5 z-10 sm:hidden ${isFocused ? 'opacity-100' : ''}`}>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="p-0.5 compact:p-2.5 rounded text-discord-text-muted/60 hover:text-discord-red transition-colors"
            title="Clear this message from the feed"
          >
            <X size={13} className="compact:w-[18px] compact:h-[18px]" />
          </button>
        )}
        <button
          onClick={() => onFocus?.(message.guildId, message.channelId, message.guildName, message.channelName)}
          className={`p-0.5 compact:p-2.5 rounded transition-colors ${
            isFocused
              ? 'text-discord-blurple'
              : 'text-discord-text-muted/60 hover:text-white'
          }`}
          title={isFocused ? 'Focused on this channel' : 'Focus on this channel'}
        >
          <Eye size={13} className="compact:w-[18px] compact:h-[18px]" />
        </button>
        {chattingEnabled && (
          <button
            onClick={() => onQuickReply?.(message.channelId)}
            className="p-0.5 compact:p-2.5 rounded text-discord-text-muted/60 hover:text-discord-green transition-colors"
            title="Quick reply to this channel"
          >
            <MessageSquareReply size={13} className="compact:w-[18px] compact:h-[18px]" />
          </button>
        )}
      </div>
      <img
        src={getAvatarUrl(message.author.id, message.author.avatar)}
        alt=""
        loading="lazy"
        decoding="async"
        className="absolute left-2 sm:left-4 top-[1.1875rem] w-8 h-8 sm:w-10 sm:h-10 rounded-full"
      />
      <div className="min-w-0">
        <div className="flex items-baseline gap-1 flex-wrap leading-[1.375rem]">
          <span
            className="font-medium text-base hover:underline cursor-pointer relative mr-1"
            style={{ color: nameHighlighted ? resolvedHighlightColor : (roleColors && message.author.roleColor ? message.author.roleColor : '#f2f3f5') }}
            onClick={handleNameClick}
            title={`${message.author.username} (${message.author.id})`}
          >
            {authorName}
            {copied && (
              <span className="absolute -top-6 left-0 text-[10px] bg-discord-dark text-discord-green px-1.5 py-0.5 rounded shadow-lg whitespace-nowrap pointer-events-none">
                ID copied!
              </span>
            )}
          </span>
          {message.author.isBot && <AppTag />}
          <span className="text-xs text-discord-text-muted leading-[1.375rem] ml-1 sm:hidden">
            {formatTimestamp(message.timestamp, true)}
          </span>
          <span className="text-xs text-discord-text-muted leading-[1.375rem] ml-1 hidden sm:inline">
            {formatTimestamp(message.timestamp)}
          </span>
          {channelBadge}
          {receiverBadge}
          <span className={`hidden sm:inline-flex items-center gap-0.5 align-middle self-center transition-opacity ${isFocused ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
            <button
              onClick={() => onFocus?.(message.guildId, message.channelId, message.guildName, message.channelName)}
              className={`p-0.5 rounded transition-colors ${
                isFocused
                  ? 'text-discord-blurple'
                  : 'text-discord-text-muted hover:text-white hover:bg-discord-hover/50'
              }`}
              title={isFocused ? 'Focused on this channel' : 'Focus on this channel'}
            >
              <Eye size={14} />
            </button>
            {chattingEnabled && (
              <button
                onClick={() => onQuickReply?.(message.channelId)}
                className="p-0.5 rounded text-discord-text-muted hover:text-discord-green hover:bg-discord-hover/50 transition-colors"
                title="Quick reply to this channel"
              >
                <MessageSquareReply size={14} />
              </button>
            )}
          </span>
          {message.hasContractAddress && (
            <span
              onClick={handleBadgeClick}
              className="text-[10px] compact:text-[11px] px-1.5 py-0.5 rounded bg-discord-yellow/20 text-discord-yellow font-semibold cursor-pointer hover:bg-discord-yellow/30 transition-colors align-middle self-center"
              title={badgeAct === 'platform' ? 'Open in trading platform' : badgeAct === 'both' ? 'Open in Discord + platform' : 'Open in Discord'}
            >
              CONTRACT
            </span>
          )}
          {hasKeywordMatch && (
            <span
              onClick={handleBadgeClick}
              className="text-[10px] compact:text-[11px] px-1.5 py-0.5 rounded bg-orange-400/20 text-orange-400 font-semibold cursor-pointer hover:bg-orange-400/30 transition-colors align-middle self-center"
              title={badgeAct === 'platform' && message.hasContractAddress ? 'Open in trading platform' : badgeAct === 'both' && message.hasContractAddress ? 'Open in Discord + platform' : 'Open in Discord'}
            >
              {message.matchedKeywords!.join(', ')}
            </span>
          )}
          {message.snipeInfo && <SnipeBadge info={message.snipeInfo} />}
          {message.isDeleted && <DeletedBadge />}
        </div>

        {message.interaction && <InteractionHeader interaction={message.interaction} channelId={message.channelId} messageId={message.id} />}

        {message.referencedMessage && (
          <ReplyPreview
            reference={message.referencedMessage}
            authorName={refAuthorName}
            addrColors={addrColors}
            roleColors={roleColors}
          />
        )}

        <div className="text-base text-discord-text-normal leading-[1.375rem] compact:leading-6 break-words whitespace-pre-wrap select-text">
          {renderContent(displayContent, message.contractAddresses, message.mentions, addrColors, templates, clickAct, showFull)}
          <EditedIndicator message={message} addrColors={addrColors} templates={templates} clickAct={clickAct} showFull={showFull} />
        </div>

        <AttachmentList attachments={message.attachments} setLightboxSrc={setLightboxSrc} />

        {message.embeds.length > 0 && !disableEmbeds && (
          <div className="flex flex-col gap-2 mt-1">
            {groupEmbeds(message.embeds).map(({ embed, gallery }, i) => (
              <EmbedCard key={i} embed={embed} gallery={gallery} showFull={showFull} setLightboxSrc={setLightboxSrc} mentions={message.mentions} />
            ))}
          </div>
        )}

        <ForwardedBlock message={message} addrColors={addrColors} templates={templates} clickAct={clickAct} showFull={showFull} setLightboxSrc={setLightboxSrc} />
        <MessageComponents message={message} addrColors={addrColors} templates={templates} clickAct={clickAct} showFull={showFull} setLightboxSrc={setLightboxSrc} />
        <PlatformExtras message={message} />
        <ReactionPills message={message} />
        <TradeButtons message={message} />
        {message.isEphemeral && <EphemeralNote />}
      </div>

      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}

      {contextMenu && (
        <UserContextMenu
          userId={message.author.id}
          displayName={message.author.displayName}
          customName={customName}
          onRename={onRenameUser ? (name) => onRenameUser(message.author.id, name) : undefined}
          guildId={message.guildId}
          channelId={message.channelId}
          channelName={message.channelName}
          guildName={message.guildName}
          openInDiscordApp={openInDiscordApp ?? true}
          position={contextMenu}
          isHighlighted={isUserHighlighted}
          onToggleHighlight={onToggleHighlight ? () => {
            const highlightKey = isTelegram && message.author.username ? `@${message.author.username}` : message.author.id;
            onToggleHighlight(highlightKey, message.author.displayName);
          } : undefined}
          onHide={() => onHideUser?.(message.guildId, message.channelId, message.author.id, authorName)}
          authorRoles={message.author.roles}
          onHideRole={onHideRole && message.guildId ? (roleId, roleName) => onHideRole(message.guildId!, roleId, roleName) : undefined}
          onToggleHighlightRole={onToggleHighlightRole && message.guildId ? (roleId, roleName) => onToggleHighlightRole(message.guildId!, roleId, roleName) : undefined}
          highlightedRoleIds={highlightedRoleIds}
          onCopyId={copyUserId}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

export default memo(Message);
