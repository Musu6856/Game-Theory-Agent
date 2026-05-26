"use client";

import { Loader2, SendHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { MarkdownRenderer } from "@/components/markdown-renderer";
import { shouldSubmitChatDraftFromKey } from "@/lib/chat-submit-key";
import type { ResearchChatViewMessage } from "@/lib/research-chat-view";

type ChatPanelProps = {
  messages: ResearchChatViewMessage[];
  isBusy: boolean;
  onSubmit: (content: string) => Promise<void> | void;
  headerTitle?: string;
  headerSubtitle?: string;
  placeholder?: string;
  emptyState?: React.ReactNode;
};

export function ChatPanel({
  messages,
  isBusy,
  onSubmit,
  headerTitle = "Research Chat",
  headerSubtitle = "Discuss the current findings and refine the direction.",
  placeholder = "Type a thought, a correction, or a question.",
  emptyState,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages]);

  async function submitDraft() {
    const content = draft.trim();
    if (!content || isBusy) return;
    setDraft("");
    await onSubmit(content);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitDraft();
  }

  async function handleDraftKeyDown(
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) {
    if (!shouldSubmitChatDraftFromKey(event)) return;
    event.preventDefault();
    await submitDraft();
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex min-h-14 shrink-0 flex-col justify-center border-b px-5 py-3">
        <div className="text-sm font-medium text-foreground">{headerTitle}</div>
        <div className="text-xs text-muted-foreground">{headerSubtitle}</div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {messages.length === 0 && emptyState ? (
          emptyState
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {messages.map((message) => (
              <article
                key={message.id}
                className={
                  message.role === "user"
                    ? "self-end text-right"
                    : "self-start text-left"
                }
              >
                <div className="mb-1 text-xs text-muted-foreground">
                  {message.role === "user" ? "You" : "PaperForge"}
                </div>
                <div
                  className={
                    message.isPending
                      ? "rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 px-3 py-2 text-muted-foreground"
                      : "rounded-md border bg-card px-3 py-2 text-card-foreground"
                  }
                  aria-live={message.isPending ? "polite" : undefined}
                >
                  {message.isPending ? (
                    <div className="flex items-center gap-2 text-sm leading-6">
                      <Loader2 className="size-4 shrink-0 animate-spin" />
                      <span>{message.content}</span>
                    </div>
                  ) : (
                    <MarkdownRenderer
                      content={message.content}
                      className="paperforge-markdown text-sm leading-6"
                    />
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <form className="shrink-0 border-t bg-background p-3" onSubmit={handleSubmit}>
        <div className="mx-auto flex max-w-3xl items-stretch gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleDraftKeyDown}
            rows={2}
            className="min-h-10 flex-1 resize-none overflow-y-auto rounded-md border bg-background px-3 py-2 text-sm leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder={placeholder}
            disabled={isBusy}
          />
          <button
            type="submit"
            disabled={!draft.trim() || isBusy}
            className="inline-flex w-11 self-stretch shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-50"
            aria-label="Send message"
          >
            <SendHorizontal size={17} />
          </button>
        </div>
      </form>
    </section>
  );
}
