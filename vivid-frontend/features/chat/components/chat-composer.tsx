"use client";

import { useRef, useState } from "react";

import {
  AttachIcon,
  ChevronDownIcon,
  MicIcon,
  WaveformIcon,
} from "@/components/ui/icons";
import { Menu, MenuItem } from "@/components/ui/menu";
import { LANGUAGES, languageLabel } from "@/features/chat/lib/languages";
import { cn } from "@/lib/utils";

interface ChatComposerProps {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: (value: string) => void;
  // The chat's language. With onLanguageChange it is a picker (new chats);
  // without, a label (a chat's language is fixed once it exists).
  language?: string;
  onLanguageChange?: (code: string) => void;
  className?: string;
  // Live-integration hooks. All optional so the launcher can render the same
  // composer before a thread exists.
  onAttachFile?: (file: File) => void;
  attachment?: { filename: string | null; url?: string | null } | null;
  attachmentUploading?: boolean;
  onClearAttachment?: () => void;
  recording?: boolean;
  transcribing?: boolean;
  onToggleMic?: () => void;
  onStartCall?: () => void;
  busy?: boolean;
  onCancel?: () => void;
}

// The prompt box. Grows with its content up to a cap, then scrolls.
export function ChatComposer({
  value,
  onValueChange,
  onSubmit,
  language = "en",
  onLanguageChange,
  className,
  onAttachFile,
  attachment,
  attachmentUploading,
  onClearAttachment,
  recording,
  transcribing,
  onToggleMic,
  onStartCall,
  busy,
  onCancel,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  function resize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }

  function submit() {
    const trimmed = value.trim();
    // Never send while the image is still uploading — the message would go
    // out without it.
    if (!trimmed || attachmentUploading) return;
    onSubmit(trimmed);
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className={cn(
        "vd-glass-card vd-sheen w-full px-3.5 pt-3 pb-2.5 transition-colors",
        focused && "border-fg/25",
        className
      )}
    >
      {attachmentUploading ? (
        <div className="text-fg/60 mb-2 flex items-center gap-2 text-[12.5px]">
          <span className="border-fg/20 border-t-fg/70 size-3.5 animate-spin rounded-full border-2" />
          Uploading image…
        </div>
      ) : attachment ? (
        <div className="text-fg/70 mb-2 flex items-center gap-2 text-[12.5px]">
          {attachment.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={attachment.url} alt="" className="size-8 rounded-md object-cover" />
          ) : null}
          <span className="max-w-[240px] truncate">{attachment.filename ?? "image"}</span>
          <span className="text-fg/40">✓ ready</span>
          <button
            type="button"
            aria-label="Remove attachment"
            onClick={onClearAttachment}
            className="text-fg/45 hover:text-fg cursor-pointer"
          >
            ×
          </button>
        </div>
      ) : null}

      <label htmlFor="chat-prompt" className="sr-only">
        Ask anything
      </label>
      <textarea
        id="chat-prompt"
        ref={textareaRef}
        rows={1}
        value={value}
        placeholder={
          recording ? "Listening…" : transcribing ? "Transcribing…" : "Ask anything…"
        }
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(event) => {
          onValueChange(event.target.value);
          resize(event.target);
        }}
        onKeyDown={(event) => {
          // Enter sends, Shift+Enter breaks the line.
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
        className="text-fg max-h-[220px] w-full resize-none bg-transparent font-sans text-[15px] font-normal outline-none"
      />

      <div className="mt-2 flex items-center gap-1.5">
        {onAttachFile ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) onAttachFile(file);
              }}
            />
            <ComposerButton label="Attach an image" onClick={() => fileRef.current?.click()}>
              <AttachIcon size={18} />
            </ComposerButton>
          </>
        ) : null}

        <div className="ml-auto flex items-center gap-1.5">
          {onLanguageChange ? (
            <Menu
              side="top"
              align="end"
              trigger={
                <button
                  type="button"
                  aria-label="Chat language"
                  className="hover:vd-glass-control text-fg/60 hover:text-fg flex h-8 cursor-pointer items-center gap-1 rounded-full px-2.5 text-[12.5px] font-medium transition-colors"
                >
                  {languageLabel(language)}
                  <ChevronDownIcon size={14} className="text-fg/40" />
                </button>
              }
            >
              {LANGUAGES.map((option) => (
                <MenuItem key={option.code} onClick={() => onLanguageChange(option.code)}>
                  {option.label}
                  {option.code === language ? <span className="text-fg/40 ml-auto text-[11px]">✓</span> : null}
                </MenuItem>
              ))}
            </Menu>
          ) : (
            <span
              title="Chat language"
              className="text-fg/45 flex h-8 items-center rounded-full px-2.5 text-[12.5px] font-medium"
            >
              {languageLabel(language)}
            </span>
          )}

          {onStartCall ? (
            <ComposerButton label="Start a voice conversation" onClick={onStartCall}>
              <WaveformIcon size={17} />
            </ComposerButton>
          ) : null}

          {onToggleMic ? (
            <ComposerButton
              label={recording ? "Stop recording and send" : "Dictate"}
              onClick={onToggleMic}
              className={cn(recording && "vd-glass-bright animate-pulse")}
            >
              <MicIcon size={18} />
            </ComposerButton>
          ) : null}

          {busy && !value.trim() && onCancel ? (
            <button
              type="button"
              aria-label="Stop generating"
              onClick={onCancel}
              className="vd-glass-bright vd-sheen grid size-8 cursor-pointer place-items-center rounded-full text-[13px]"
            >
              ■
            </button>
          ) : (
            <button
              type="submit"
              aria-label="Send"
              disabled={!value.trim() || attachmentUploading}
              className="vd-glass-bright vd-sheen grid size-8 cursor-pointer place-items-center rounded-full disabled:pointer-events-none disabled:opacity-35"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 19V5m0 0-6 6m6-6 6 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </div>
      </div>
    </form>
  );
}

function ComposerButton({
  label,
  className,
  onClick,
  children,
}: {
  label: string;
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "hover:vd-glass-control text-fg/55 hover:text-fg flex h-8 cursor-pointer items-center justify-center rounded-full px-2 transition-colors",
        className
      )}
    >
      {children}
    </button>
  );
}
