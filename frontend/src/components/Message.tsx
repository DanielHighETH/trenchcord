import { type ReactNode, Fragment, useState } from 'react';
import { Eye } from 'lucide-react';
import type { FrontendMessage, ContractLinkTemplates, ContractClickAction, BadgeClickAction, HighlightMode } from '../types';
import ImageLightbox from './ImageLightbox';
import UserContextMenu from './UserContextMenu';
import { buildContractUrl, DEFAULT_LINK_TEMPLATES } from '../utils/contractUrl';

interface AddressColors {
  evm: string;
  sol: string;
}

interface MessageProps {
  message: FrontendMessage;
  isCompact: boolean;
  guildColor?: string;
  highlightMode?: HighlightMode;
  highlightColor?: string;
  disableEmbeds?: boolean;
  evmAddressColor?: string;
  solAddressColor?: string;
  contractLinkTemplates?: ContractLinkTemplates;
  contractClickAction?: ContractClickAction;
  openInDiscordApp?: boolean;
  badgeClickAction?: BadgeClickAction;
  onHideUser?: (guildId: string | null, channelId: string, userId: string, displayName: string) => void;
  onFocus?: (guildId: string | null, channelId: string, guildName: string | null, channelName: string) => void;
  isFocused?: boolean;
}

function getAvatarUrl(userId: string, avatar: string | null, discriminator?: string): string {
  if (avatar) {
    return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.webp?size=80`;
  }
  const index = discriminator === '0' || !discriminator
    ? (BigInt(userId) >> 22n) % 6n
    : parseInt(discriminator) % 5;
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Today at ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday at ${time}`;
  return `${d.toLocaleDateString()} ${time}`;
}

const URL_REGEX = /(https?:\/\/[^\s<>()[\]]+(?:\([^\s<>()]*\))*[^\s<>()[\],.'\"!?;:]?)/g;
const DISCORD_MENTION_REGEX = /<@!?(\d+)>|<#(\d+)>|<@&(\d+)>/g;
const EMOJI_REGEX = /<a?:(\w+):(\d+)>/g;
const BOLD_REGEX = /\*\*(.+?)\*\*/g;
const MARKDOWN_LINK_REGEX = /\[([^\]]+)\]\(<?(https?:\/\/[^>)\s]+)>?\)/g;
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
        {url.length > 70 ? url.slice(0, 65) + '...' : url}
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
    window.open(buildContractUrl(addr, linkTemplates), '_blank');
  }
}

function applyInlineFormatting(
  parts: (string | ReactNode)[],
  contractAddresses: string[],
  mentions: Record<string, string>,
  addressColors?: AddressColors,
  linkTemplates: ContractLinkTemplates = DEFAULT_LINK_TEMPLATES,
  clickAction: ContractClickAction = 'copy_open',
): (string | ReactNode)[] {
  // Markdown links [text](url)
  parts = splitByRegex(parts, MARKDOWN_LINK_REGEX, (m, i) => (
    <a
      key={`mdlink-${i}`}
      href={m[2]}
      target="_blank"
      rel="noopener noreferrer"
      className="text-discord-text-link hover:underline"
    >
      {m[1]}
    </a>
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
      {m[1].length > 70 ? m[1].slice(0, 65) + '...' : m[1]}
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
      src={`https://cdn.discordapp.com/emojis/${m[2]}.${m[0].startsWith('<a:') ? 'gif' : 'webp'}?size=20`}
      alt={`:${m[1]}:`}
      title={`:${m[1]}:`}
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
  {
    const urlified: (string | ReactNode)[] = [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (typeof part !== 'string') { urlified.push(part); continue; }
      urlified.push(...linkifyText(part, `p${i}`));
    }
    parts = urlified;
  }

  // Contract addresses -- AFTER all URL processing
  for (const addr of contractAddresses) {
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
              className="px-1 rounded text-[13px] font-mono cursor-pointer inline-flex items-center gap-1 transition-opacity hover:opacity-80"
              style={{ backgroundColor: `${color}20`, color }}
              title={contractClickTitle(clickAction, addr)}
              onClick={() => handleContractClick(addr, clickAction, linkTemplates)}
            >
              {addr.slice(0, 6)}...{addr.slice(-4)}
            </span>
          );
        }
      }
    }
    parts = newParts;
  }

  return parts;
}

function renderInlineMarkdown(content: string, contractAddresses: string[], mentions: Record<string, string> = {}, addressColors?: AddressColors, linkTemplates: ContractLinkTemplates = DEFAULT_LINK_TEMPLATES, clickAction: ContractClickAction = 'copy_open'): ReactNode[] {
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
          className="px-1 rounded text-[13px] font-mono cursor-pointer inline-flex items-center gap-1 transition-opacity hover:opacity-80"
          style={{ backgroundColor: `${color}20`, color }}
          title={contractClickTitle(clickAction, matchedAddr)}
          onClick={() => handleContractClick(matchedAddr, clickAction, linkTemplates)}
        >
          {matchedAddr.slice(0, 6)}...{matchedAddr.slice(-4)}
        </span>
      );
    }
    return (
      <code key={`code-${i}`} className="bg-discord-embed-bg px-1 py-0.5 rounded text-[0.85em] font-mono">
        {codeText}
      </code>
    );
  });

  // 2. Bold — processed before links so **[text](url) stuff** works.
  //    Inner content is recursively formatted for links, emojis, etc.
  parts = splitByRegex(parts, BOLD_REGEX, (m, i) => (
    <strong key={`bold-${i}`} className="font-semibold text-white">
      {applyInlineFormatting([m[1]], contractAddresses, mentions, addressColors, linkTemplates, clickAction)}
    </strong>
  ));

  // 3. Everything else on non-bold text
  parts = applyInlineFormatting(parts, contractAddresses, mentions, addressColors, linkTemplates, clickAction);

  return parts as ReactNode[];
}

function renderContent(content: string, contractAddresses: string[], mentions: Record<string, string> = {}, addressColors?: AddressColors, linkTemplates: ContractLinkTemplates = DEFAULT_LINK_TEMPLATES, clickAction: ContractClickAction = 'copy_open') {
  if (!content) return null;

  // Extract code blocks first, replace with placeholders
  const codeBlocks: ReactNode[] = [];
  const withoutCodeBlocks = content.replace(CODE_BLOCK_REGEX, (_match, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(
      <pre key={`codeblock-${idx}`} className="bg-discord-embed-bg border border-discord-dark/50 rounded p-2 my-1 text-sm font-mono overflow-x-auto whitespace-pre-wrap">
        <code>{code}</code>
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
      <div key={`quote-${lineKey++}`} className="border-l-[3px] border-discord-text-muted/40 pl-3 my-1">
        {renderLineGroup(quoteContent, contractAddresses)}
      </div>
    );
    quoteBuffer = [];
  }

  function renderLineGroup(text: string, contracts: string[]): ReactNode {
    const groupLines = text.split('\n');
    const parts: ReactNode[] = [];
    for (let i = 0; i < groupLines.length; i++) {
      if (i > 0) parts.push(<br key={`lbr-${lineKey}-${i}`} />);
      const placeholderMatch = groupLines[i].match(/\x00CODEBLOCK_(\d+)\x00/);
      if (placeholderMatch) {
        parts.push(codeBlocks[parseInt(placeholderMatch[1])]);
      } else {
        parts.push(...renderInlineMarkdown(groupLines[i], contracts, mentions, addressColors, linkTemplates, clickAction));
      }
    }
    return <>{parts}</>;
  }

  for (const line of lines) {
    if (line.startsWith('> ') || line === '>') {
      quoteBuffer.push(line.slice(2));
    } else {
      flushQuotes();
      // Check for code block placeholder
      const placeholderMatch = line.match(/\x00CODEBLOCK_(\d+)\x00/);
      if (placeholderMatch) {
        result.push(codeBlocks[parseInt(placeholderMatch[1])]);
      } else {
        if (result.length > 0) result.push(<br key={`br-${lineKey++}`} />);
        result.push(
          <Fragment key={`line-${lineKey++}`}>
            {renderInlineMarkdown(line, contractAddresses, mentions, addressColors, linkTemplates, clickAction)}
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

const EVM_ADDR_RE = /\b0x[a-fA-F0-9]{40}\b/g;
const SOL_ADDR_RE = /(?<![1-9A-HJ-NP-Za-km-z])[1-9A-HJ-NP-Za-km-z]{40,48}(?![1-9A-HJ-NP-Za-km-z])/g;

function detectAddresses(text: string): string[] {
  // Strip URLs so we don't detect addresses embedded in links
  const stripped = text
    .replace(/https?:\/\/[^\s<>)]+/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  const addrs: string[] = [];
  const evm = stripped.match(EVM_ADDR_RE);
  if (evm) addrs.push(...evm);
  const sol = stripped.match(SOL_ADDR_RE);
  if (sol) {
    for (const m of sol) {
      if (!addrs.includes(m) && /\d/.test(m) && /[a-z]/.test(m) && /[A-Z]/.test(m)) {
        addrs.push(m);
      }
    }
  }
  return addrs;
}

function renderEmbedDescription(text: string): ReactNode {
  return renderContent(text, detectAddresses(text));
}

function ReactionPills({ reactions }: { reactions: FrontendMessage['reactions'] }) {
  if (!reactions || reactions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-0.5">
      {reactions.map((r, i) => {
        const emojiContent = r.emoji.id ? (
          <img
            src={`https://cdn.discordapp.com/emojis/${r.emoji.id}.${r.emoji.animated ? 'gif' : 'webp'}?size=16`}
            alt={r.emoji.name}
            className="w-4 h-4"
          />
        ) : (
          <span className="text-sm leading-none">{r.emoji.name}</span>
        );
        return (
          <span
            key={`${r.emoji.id ?? r.emoji.name}-${i}`}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-discord-embed-bg text-discord-text-muted text-xs border border-transparent hover:border-discord-text-muted/30 transition-colors"
            title={r.emoji.name}
          >
            {emojiContent}
            <span>{r.count}</span>
          </span>
        );
      })}
    </div>
  );
}

export default function Message({ message, isCompact, guildColor, highlightMode = 'background', highlightColor, disableEmbeds, evmAddressColor, solAddressColor, contractLinkTemplates, contractClickAction, openInDiscordApp, badgeClickAction, onHideUser, onFocus, isFocused }: MessageProps) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const addrColors: AddressColors = { evm: evmAddressColor ?? '#fee75c', sol: solAddressColor ?? '#14f195' };
  const templates: ContractLinkTemplates = contractLinkTemplates ?? DEFAULT_LINK_TEMPLATES;
  const clickAct: ContractClickAction = contractClickAction ?? 'copy_open';
  const [copied, setCopied] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const copyUserId = () => {
    navigator.clipboard.writeText(message.author.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleNameClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setContextMenu({ x: rect.left, y: rect.bottom + 4 });
  };

  const useUsernameHighlight = highlightMode === 'username';
  const hasKeywordMatch = (message.matchedKeywords?.length ?? 0) > 0;
  const resolvedHighlightColor = highlightColor || '#5865f2';
  const hasCustomColor = !!highlightColor;

  const highlightClass = message.isHighlighted
    ? useUsernameHighlight
      ? hasCustomColor ? 'border-l-2' : 'border-l-2 border-discord-blurple'
      : hasCustomColor ? 'border-l-2' : 'border-l-2 border-discord-blurple bg-discord-highlight'
    : hasKeywordMatch
      ? 'border-l-2 border-orange-400 bg-orange-400/5'
      : '';

  const highlightInlineStyle: React.CSSProperties = {};
  if (message.isHighlighted && hasCustomColor) {
    highlightInlineStyle.borderColor = resolvedHighlightColor;
    if (!useUsernameHighlight) {
      highlightInlineStyle.backgroundColor = `${resolvedHighlightColor}15`;
    }
  }

  const bgStyle = guildColor ? { backgroundColor: guildColor, ...highlightInlineStyle } : highlightInlineStyle;

  const discordPath = `discord.com/channels/${message.guildId ?? '@me'}/${message.channelId}/${message.id}`;
  const discordUrl = openInDiscordApp ? `discord://${discordPath}` : `https://${discordPath}`;
  const badgeAct: BadgeClickAction = badgeClickAction ?? 'discord';

  const handleBadgeClick = () => {
    const hasContract = message.hasContractAddress && message.contractAddresses.length > 0;
    const openDiscord = () => {
      if (openInDiscordApp) {
        window.location.href = discordUrl;
      } else {
        window.open(discordUrl, '_blank', 'noopener,noreferrer');
      }
    };
    const openPlatform = () => {
      if (hasContract) {
        const url = buildContractUrl(message.contractAddresses[0], templates);
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    };

    switch (badgeAct) {
      case 'platform':
        if (hasContract) openPlatform();
        else openDiscord();
        break;
      case 'both':
        openDiscord();
        if (hasContract) openPlatform();
        break;
      case 'discord':
      default:
        openDiscord();
        break;
    }
  };

  const channelBadge = openInDiscordApp ? (
    <span
      onClick={() => { window.location.href = discordUrl; }}
      className="text-[0.6875rem] px-1.5 py-0.5 rounded bg-discord-embed-bg text-discord-text-muted font-medium shrink-0 hover:text-discord-text hover:bg-discord-dark transition-colors cursor-pointer"
      title="Open in Discord app"
    >
      {message.guildName ? `${message.guildName}` : ''}{message.guildName ? ' / ' : ''}#{message.channelName}
    </span>
  ) : (
    <a
      href={discordUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[0.6875rem] px-1.5 py-0.5 rounded bg-discord-embed-bg text-discord-text-muted font-medium shrink-0 hover:text-discord-text hover:bg-discord-dark transition-colors cursor-pointer"
      title="Open in Discord"
    >
      {message.guildName ? `${message.guildName}` : ''}{message.guildName ? ' / ' : ''}#{message.channelName}
    </a>
  );

  if (isCompact) {
    return (
      <div className={`group/compact relative hover:bg-discord-hover py-[2px] pr-[48px] pl-[72px] ${highlightClass} min-h-[1.375rem]`} style={bgStyle}>
        <span className="absolute left-0 w-[72px] text-[0.6875rem] text-discord-text-muted text-right pr-4 pt-[2px] opacity-0 group-hover/compact:opacity-100 select-none leading-[1.375rem]">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        <div className="min-w-0">
          {message.referencedMessage && (
            <div
              className="flex items-center gap-1 text-xs text-discord-text-muted mb-0.5 cursor-pointer hover:text-discord-text-normal max-w-full overflow-hidden"
              onClick={() => {
                const el = document.getElementById(`msg-${message.referencedMessage!.id}`);
                if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('bg-discord-hover'); setTimeout(() => el.classList.remove('bg-discord-hover'), 2000); }
              }}
            >
              <div className="w-8 h-3 border-l-2 border-t-2 border-discord-text-muted/30 rounded-tl ml-1 shrink-0" />
              <span className="font-medium text-discord-text-muted shrink-0">{message.referencedMessage.author}</span>
              <span className="truncate opacity-70">
                {renderInlineMarkdown(message.referencedMessage.content, [], message.referencedMessage.mentions ?? {}, addrColors)}
              </span>
            </div>
          )}

          <div className="text-base text-discord-text-normal leading-[1.375rem] break-words">
            {renderContent(message.content, message.contractAddresses, message.mentions, addrColors, templates, clickAct)}
          </div>

          {message.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-1">
              {message.attachments.map((att) =>
                att.content_type?.startsWith('image/') ? (
                  <img
                    key={att.id}
                    src={att.proxy_url}
                    alt={att.filename}
                    className="max-w-[400px] max-h-[300px] rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => setLightboxSrc(att.proxy_url)}
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
          )}

          {message.embeds.length > 0 && !disableEmbeds && (
            <div className="flex flex-col gap-2 mt-1">
              {message.embeds.map((embed, i) => (
                <div
                  key={i}
                  className="border-l-4 rounded bg-discord-embed-bg p-3 max-w-[520px]"
                  style={{ borderColor: embed.color ? `#${embed.color.toString(16).padStart(6, '0')}` : '#1e1f22' }}
                >
                  {embed.author?.name && (
                    <div className="flex items-center gap-2 mb-1">
                      {embed.author.icon_url && (
                        <img src={embed.author.icon_url} alt="" className="w-6 h-6 rounded-full" />
                      )}
                      {embed.author.url ? (
                        <a href={embed.author.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-white hover:underline">
                          {renderInlineMarkdown(embed.author.name, [], {})}
                        </a>
                      ) : (
                        <span className="text-sm font-medium text-white">
                          {renderInlineMarkdown(embed.author.name, [], {})}
                        </span>
                      )}
                    </div>
                  )}
                  {embed.title && (
                    <div className="font-semibold text-sm">
                      {embed.url ? (
                        <a href={embed.url} target="_blank" rel="noopener noreferrer" className="hover:underline text-discord-text-link">
                          {renderInlineMarkdown(embed.title, [], {})}
                        </a>
                      ) : <span className="text-white">{renderInlineMarkdown(embed.title, [], {})}</span>}
                    </div>
                  )}
                  {embed.description && (
                    <div className="text-[13px] text-discord-text mt-1 leading-[1.125rem]">
                      {renderEmbedDescription(embed.description)}
                    </div>
                  )}
                  {embed.fields && embed.fields.length > 0 && (
                    <div className="grid gap-y-1 gap-x-2 mt-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
                      {embed.fields.map((field, fi) => (
                        <div key={fi} className={field.inline ? '' : 'col-span-full'}>
                          <div className="text-xs font-semibold text-white mb-0.5">
                            {renderInlineMarkdown(field.name, [], {})}
                          </div>
                          <div className="text-[13px] text-discord-text leading-[1.125rem]">
                            {renderEmbedDescription(field.value)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {embed.thumbnail && !embed.image && (
                    <img
                      src={embed.thumbnail.url}
                      alt=""
                      className="max-w-[80px] max-h-[80px] rounded mt-2 cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => setLightboxSrc(embed.thumbnail!.url)}
                    />
                  )}
                  {embed.image && (
                    <img
                      src={embed.image.url}
                      alt=""
                      className="max-w-[400px] max-h-[300px] rounded mt-2 cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => setLightboxSrc(embed.image!.url)}
                    />
                  )}
                  {embed.footer?.text && (
                    <div className="flex items-center gap-2 mt-2 text-xs text-discord-text-muted">
                      {embed.footer.icon_url && (
                        <img src={embed.footer.icon_url} alt="" className="w-5 h-5 rounded-full" />
                      )}
                      <span>{embed.footer.text}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <ReactionPills reactions={message.reactions} />
        </div>

        {lightboxSrc && (
          <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
        )}
      </div>
    );
  }

  return (
    <div className={`relative hover:bg-discord-hover mt-[1.0625rem] py-[2px] pr-[48px] pl-[72px] ${highlightClass} group`} style={bgStyle}>
      <img
        src={getAvatarUrl(message.author.id, message.author.avatar)}
        alt=""
        className="absolute left-4 w-10 h-10 rounded-full mt-[2px]"
      />
      <div className="min-w-0">
        <div className="flex items-baseline gap-1 flex-wrap leading-[1.375rem]">
          <span
            className="font-medium text-base hover:underline cursor-pointer relative mr-1"
            style={{ color: message.isHighlighted ? resolvedHighlightColor : '#f2f3f5' }}
            onClick={handleNameClick}
            title={`${message.author.username} (${message.author.id})`}
          >
            {message.author.displayName}
            {copied && (
              <span className="absolute -top-6 left-0 text-[10px] bg-discord-dark text-discord-green px-1.5 py-0.5 rounded shadow-lg whitespace-nowrap pointer-events-none">
                ID copied!
              </span>
            )}
          </span>
          <span className="text-xs text-discord-text-muted leading-[1.375rem] ml-1">
            {formatTimestamp(message.timestamp)}
          </span>
          {channelBadge}
          <button
            onClick={() => onFocus?.(message.guildId, message.channelId, message.guildName, message.channelName)}
            className={`opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded ${
              isFocused
                ? '!opacity-100 text-discord-blurple'
                : 'text-discord-text-muted hover:text-white'
            }`}
            title={isFocused ? 'Focused on this channel' : 'Focus on this channel'}
          >
            <Eye size={13} />
          </button>
          {message.hasContractAddress && (
            <span
              onClick={handleBadgeClick}
              className="text-[10px] px-1.5 py-0.5 rounded bg-discord-yellow/20 text-discord-yellow font-semibold cursor-pointer hover:bg-discord-yellow/30 transition-colors"
              title={badgeAct === 'platform' ? 'Open in trading platform' : badgeAct === 'both' ? 'Open in Discord + platform' : 'Open in Discord'}
            >
              CONTRACT
            </span>
          )}
          {hasKeywordMatch && (
            <span
              onClick={handleBadgeClick}
              className="text-[10px] px-1.5 py-0.5 rounded bg-orange-400/20 text-orange-400 font-semibold cursor-pointer hover:bg-orange-400/30 transition-colors"
              title={badgeAct === 'platform' && message.hasContractAddress ? 'Open in trading platform' : badgeAct === 'both' && message.hasContractAddress ? 'Open in Discord + platform' : 'Open in Discord'}
            >
              {message.matchedKeywords!.join(', ')}
            </span>
          )}
        </div>

        {message.referencedMessage && (
          <div
            className="flex items-center gap-1.5 text-sm text-discord-text-muted mt-0.5 mb-0.5 cursor-pointer hover:text-discord-text transition-colors"
            onClick={() => {
              const el = document.getElementById(`msg-${message.referencedMessage!.id}`);
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.add('bg-discord-blurple/10');
                setTimeout(() => el.classList.remove('bg-discord-blurple/10'), 2000);
              }
            }}
          >
            <div className="w-8 h-3 border-l-2 border-t-2 border-discord-text-muted/30 rounded-tl ml-1 shrink-0" />
            <span className="font-medium text-discord-text-muted shrink-0">{message.referencedMessage.author}</span>
            <span className="truncate opacity-70">
              {renderInlineMarkdown(message.referencedMessage.content, [], message.referencedMessage.mentions ?? {}, addrColors)}
            </span>
          </div>
        )}

        <div className="text-base text-discord-text-normal leading-[1.375rem] break-words whitespace-pre-wrap">
          {renderContent(message.content, message.contractAddresses, message.mentions, addrColors, templates, clickAct)}
        </div>

        {message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-1">
            {message.attachments.map((att) =>
              att.content_type?.startsWith('image/') ? (
                <img
                  key={att.id}
                  src={att.proxy_url}
                  alt={att.filename}
                  className="max-w-[400px] max-h-[300px] rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => setLightboxSrc(att.proxy_url)}
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
        )}

        {message.embeds.length > 0 && !disableEmbeds && (
          <div className="flex flex-col gap-2 mt-1">
            {message.embeds.map((embed, i) => (
              <div
                key={i}
                className="border-l-4 rounded bg-discord-embed-bg p-3 max-w-[520px]"
                style={{ borderColor: embed.color ? `#${embed.color.toString(16).padStart(6, '0')}` : '#1e1f22' }}
              >
                {embed.author?.name && (
                  <div className="flex items-center gap-2 mb-1">
                    {embed.author.icon_url && (
                      <img src={embed.author.icon_url} alt="" className="w-6 h-6 rounded-full" />
                    )}
                    {embed.author.url ? (
                      <a href={embed.author.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-white hover:underline">
                        {renderInlineMarkdown(embed.author.name, [], {})}
                      </a>
                    ) : (
                      <span className="text-sm font-medium text-white">
                        {renderInlineMarkdown(embed.author.name, [], {})}
                      </span>
                    )}
                  </div>
                )}
                {embed.title && (
                  <div className="font-semibold text-sm">
                    {embed.url ? (
                      <a href={embed.url} target="_blank" rel="noopener noreferrer" className="hover:underline text-discord-text-link">
                        {renderInlineMarkdown(embed.title, [], {})}
                      </a>
                    ) : <span className="text-white">{renderInlineMarkdown(embed.title, [], {})}</span>}
                  </div>
                )}
                {embed.description && (
                  <div className="text-[13px] text-discord-text mt-1 leading-[1.125rem]">
                    {renderEmbedDescription(embed.description)}
                  </div>
                )}
                {embed.fields && embed.fields.length > 0 && (
                  <div className="grid gap-y-1 gap-x-2 mt-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
                    {embed.fields.map((field, fi) => (
                      <div key={fi} className={field.inline ? '' : 'col-span-full'}>
                        <div className="text-xs font-semibold text-white mb-0.5">
                          {renderInlineMarkdown(field.name, [], {})}
                        </div>
                        <div className="text-[13px] text-discord-text leading-[1.125rem]">
                          {renderEmbedDescription(field.value)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {embed.thumbnail && !embed.image && (
                  <img
                    src={embed.thumbnail.url}
                    alt=""
                    className="max-w-[80px] max-h-[80px] rounded mt-2 cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => setLightboxSrc(embed.thumbnail!.url)}
                  />
                )}
                {embed.image && (
                  <img
                    src={embed.image.url}
                    alt=""
                    className="max-w-[400px] max-h-[300px] rounded mt-2 cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => setLightboxSrc(embed.image!.url)}
                  />
                )}
                {embed.footer?.text && (
                  <div className="flex items-center gap-2 mt-2 text-xs text-discord-text-muted">
                    {embed.footer.icon_url && (
                      <img src={embed.footer.icon_url} alt="" className="w-5 h-5 rounded-full" />
                    )}
                    <span>{embed.footer.text}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <ReactionPills reactions={message.reactions} />
      </div>

      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}

      {contextMenu && (
        <UserContextMenu
          userId={message.author.id}
          displayName={message.author.displayName}
          guildId={message.guildId}
          channelId={message.channelId}
          channelName={message.channelName}
          guildName={message.guildName}
          openInDiscordApp={openInDiscordApp ?? false}
          position={contextMenu}
          onHide={() => onHideUser?.(message.guildId, message.channelId, message.author.id, message.author.displayName)}
          onCopyId={copyUserId}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
