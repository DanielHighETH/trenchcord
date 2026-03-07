import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Send as SendIcon, Plus, X, AlertTriangle, Hash, FileIcon } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import type { ChannelRef } from '../types';

interface ChatInputProps {
  channels: ChannelRef[];
  defaultChannelId?: string | null;
  isDM?: boolean;
  dmChannelId?: string | null;
  dmSource?: 'discord' | 'telegram';
}

export default function ChatInput({ channels, defaultChannelId, isDM, dmChannelId, dmSource }: ChatInputProps) {
  const sendMessage = useAppStore((s) => s.sendMessage);
  const [content, setContent] = useState('');
  const [selectedChannelId, setSelectedChannelId] = useState<string>(defaultChannelId ?? channels[0]?.channelId ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (defaultChannelId && !isDM) {
      setSelectedChannelId(defaultChannelId);
      textareaRef.current?.focus();
    }
  }, [defaultChannelId, isDM]);

  const effectiveChannelId = isDM ? dmChannelId ?? '' : selectedChannelId;
  const selectedChannel = channels.find((c) => c.channelId === effectiveChannelId);
  const effectiveSource = isDM ? (dmSource ?? 'discord') : (selectedChannel?.source ?? 'discord');
  const isTelegramChannel = effectiveSource === 'telegram';

  const uniqueChannels = useMemo(() =>
    channels.reduce<ChannelRef[]>((acc, ch) => {
      if (!acc.some((c) => c.channelId === ch.channelId)) acc.push(ch);
      return acc;
    }, []),
  [channels]);

  const showChannelSelector = !isDM && uniqueChannels.length > 1;

  const placeholderText = isDM
    ? 'Message this DM'
    : selectedChannel
      ? isTelegramChannel
        ? `Message ${selectedChannel.channelName ?? 'chat'}`
        : `Message #${selectedChannel.channelName ?? 'channel'}`
      : 'Select a channel to message';

  const handleSend = useCallback(async () => {
    if (sending) return;
    if (!effectiveChannelId) {
      if (showChannelSelector) { setDropdownOpen(true); return; }
      setError('Select a channel first');
      return;
    }
    if (!content.trim() && files.length === 0) return;

    setSending(true);
    setError(null);
    try {
      const result = await sendMessage(effectiveChannelId, content, files.length > 0 ? files : undefined, effectiveSource);
      if (result.success) {
        setContent('');
        setFiles([]);
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
          textareaRef.current.focus();
        }
      } else {
        setError(result.error ?? 'Failed to send');
      }
    } finally {
      setSending(false);
    }
  }, [effectiveChannelId, content, files, sending, sendMessage, showChannelSelector, effectiveSource]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    setFiles((prev) => [...prev, ...selected].slice(0, 10));
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pastedFiles: File[] = [];
    for (let i = 0; i < e.clipboardData.items.length; i++) {
      if (e.clipboardData.items[i].kind === 'file') {
        const file = e.clipboardData.items[i].getAsFile();
        if (file) pastedFiles.push(file);
      }
    }
    if (pastedFiles.length > 0) {
      setFiles((prev) => [...prev, ...pastedFiles].slice(0, 10));
    }
  };

  const groupedChannels = useMemo(() => {
    const discordChannels = uniqueChannels.filter((ch) => ch.source !== 'telegram');
    const telegramChannels = uniqueChannels.filter((ch) => ch.source === 'telegram');

    const groups: Record<string, { channels: ChannelRef[]; isTelegram: boolean }> = {};

    const discordGroups = discordChannels.reduce<Record<string, ChannelRef[]>>((acc, ch) => {
      const guild = ch.guildName ?? 'Direct Messages';
      if (!acc[guild]) acc[guild] = [];
      acc[guild].push(ch);
      return acc;
    }, {});

    for (const key of Object.keys(discordGroups).sort((a, b) =>
      a === 'Direct Messages' ? 1 : b === 'Direct Messages' ? -1 : 0
    )) {
      groups[key] = { channels: discordGroups[key], isTelegram: false };
    }

    if (telegramChannels.length > 0) {
      groups['Telegram'] = { channels: telegramChannels, isTelegram: true };
    }

    return groups;
  }, [uniqueChannels]);

  const filePreviewUrls = useMemo(() =>
    files.map((f) => f.type.startsWith('image/') ? URL.createObjectURL(f) : null),
  [files]);

  useEffect(() => {
    return () => filePreviewUrls.forEach((url) => url && URL.revokeObjectURL(url));
  }, [filePreviewUrls]);

  const selectorIcon = isTelegramChannel
    ? <SendIcon size={22} strokeWidth={2.5} />
    : <Hash size={22} strokeWidth={2.5} />;

  return (
    <div className="px-2 sm:px-4 pb-4 sm:pb-6 pt-3 sm:pt-4 shrink-0">
      {error && (
        <div className="mb-1.5 flex items-center gap-1.5 text-xs text-discord-red bg-discord-red/10 rounded px-3 py-1.5">
          <AlertTriangle size={12} className="shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-discord-red/60 hover:text-discord-red"><X size={12} /></button>
        </div>
      )}

      <div className="rounded-lg bg-[#383a40]">
        {files.length > 0 && (
          <div className="px-4 pt-3 pb-2 flex gap-2 overflow-x-auto border-b border-[#2e3035]">
            {files.map((file, i) => (
              <div key={i} className="relative group/file shrink-0">
                {filePreviewUrls[i] ? (
                  <div className="w-[60px] h-[60px] rounded overflow-hidden bg-[#2b2d31]">
                    <img src={filePreviewUrls[i]!} alt={file.name} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-[60px] h-[60px] rounded bg-[#2b2d31] flex flex-col items-center justify-center gap-0.5 px-1">
                    <FileIcon size={18} className="text-[#b5bac1]" />
                    <span className="text-[8px] text-[#949ba4] truncate w-full text-center">{file.name.split('.').pop()?.toUpperCase()}</span>
                  </div>
                )}
                <button
                  onClick={() => removeFile(i)}
                  className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full bg-[#1e1f22] border-2 border-[#383a40] flex items-center justify-center opacity-0 group-hover/file:opacity-100 transition-opacity"
                >
                  <X size={8} className="text-[#dbdee1]" />
                </button>
                <div className="mt-0.5 text-[8px] text-[#949ba4] truncate w-[60px] text-center leading-tight">{file.name}</div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center min-h-[44px]">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center w-[44px] shrink-0 text-[#b5bac1] hover:text-[#dbdee1] transition-colors"
            title="Upload a file"
          >
            <Plus size={22} strokeWidth={2.5} />
          </button>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />

          <div className="flex-1 min-w-0">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                const el = e.target;
                el.style.height = 'auto';
                el.style.height = Math.min(el.scrollHeight, 144) + 'px';
              }}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={placeholderText}
              className="w-full bg-transparent text-[#dbdee1] text-[15px] leading-[1] pt-[16px] pb-[12px] outline-none placeholder:text-[#87898c] resize-none overflow-y-hidden"
              style={{ maxHeight: 144 }}
              rows={1}
              disabled={sending}
            />
          </div>

          <div className="flex items-center shrink-0 pr-2 gap-0.5">
            {showChannelSelector && (
              <div className="relative">
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className={`flex items-center justify-center w-[34px] h-[34px] rounded transition-colors ${
                    dropdownOpen ? 'text-[#dbdee1]' : 'text-[#b5bac1] hover:text-[#dbdee1]'
                  }`}
                  title={selectedChannel
                    ? isTelegramChannel
                      ? `Sending to ${selectedChannel.channelName}`
                      : `Sending to #${selectedChannel.channelName}`
                    : 'Select channel'
                  }
                >
                  {selectorIcon}
                </button>

                {dropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                    <div className="absolute bottom-full right-0 mb-2 w-60 max-h-[280px] overflow-y-auto bg-[#111214] rounded-md shadow-xl border border-[#1e1f22] z-50 py-1">
                      {Object.entries(groupedChannels).map(([groupName, { channels: chs, isTelegram }]) => (
                        <div key={groupName}>
                          <div className="px-2.5 pt-2 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-[#949ba4] flex items-center gap-1">
                            {isTelegram
                              ? <SendIcon size={9} className="opacity-60" />
                              : <Hash size={9} className="opacity-60" />
                            }
                            {groupName}
                          </div>
                          {chs.map((ch) => (
                            <button
                              key={ch.channelId}
                              onClick={() => { setSelectedChannelId(ch.channelId); setDropdownOpen(false); textareaRef.current?.focus(); }}
                              className={`w-full text-left px-2.5 py-[5px] text-[13px] flex items-center gap-1.5 rounded-[3px] mx-0.5 transition-colors ${
                                ch.channelId === selectedChannelId
                                  ? 'bg-[#404249] text-white'
                                  : 'text-[#b5bac1] hover:bg-[#35373c] hover:text-[#dbdee1]'
                              }`}
                              style={{ width: 'calc(100% - 4px)' }}
                            >
                              {ch.source === 'telegram'
                                ? <SendIcon size={14} className="shrink-0 opacity-40" />
                                : <Hash size={14} className="shrink-0 opacity-40" />
                              }
                              <span className="truncate">{ch.channelName ?? ch.channelId}</span>
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            <button
              onClick={handleSend}
              disabled={sending || (!content.trim() && files.length === 0) || !effectiveChannelId}
              className={`flex items-center justify-center w-[34px] h-[34px] rounded transition-colors ${
                !sending && (content.trim() || files.length > 0) && effectiveChannelId
                  ? isTelegramChannel ? 'text-[#2AABEE] hover:text-[#5BC0F0]' : 'text-[#5865f2] hover:text-[#7983f5]'
                  : 'text-[#4e5058] cursor-not-allowed'
              }`}
              title="Send message (Enter)"
            >
              <SendIcon size={22} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
