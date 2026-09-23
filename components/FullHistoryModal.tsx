"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "./I18nProvider";
import { ModalSurface } from "./ModalSurface";
import { MessageView } from "./MessageView";
import { ChatMinimap, useMessageRefs } from "./ChatMinimap";
import { fetchFullContext } from "@/hooks/agent-session/session-loader-api";
import type { AgentMessage, ToolResultMessage } from "@/lib/types";

export interface FullHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string | null;
}

/**
 * Read-only viewer for the FULL session history on the current leaf path —
 * including messages that were compacted away (pi keeps them in the .jsonl;
 * the normal chat view only shows the post-compaction context).
 */
export function FullHistoryModal({ isOpen, onClose, sessionId }: FullHistoryModalProps) {
  const { t } = useI18n();
  const [messages, setMessages] = useState<AgentMessage[] | null>(null);
  const [entryIds, setEntryIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen || !sessionId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMessages(null);
    fetchFullContext(sessionId)
      .then((data) => {
        if (cancelled) return;
        setMessages(data.context.messages);
        setEntryIds(data.context.entryIds);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, sessionId]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const toolResultsMap = useMemo(() => {
    const m = new Map<string, ToolResultMessage>();
    for (const msg of messages ?? []) {
      if (msg.role === "toolResult") {
        m.set((msg as ToolResultMessage).toolCallId, msg as ToolResultMessage);
      }
    }
    return m;
  }, [messages]);

  // Minimap refs are indexed by user/assistant message ordinal (same as MessageList).
  const messageRefs = useMessageRefs(messages?.length ?? 0);

  if (!isOpen) return null;

  let refIdx = 0;

  return (
    <ModalSurface
      panelClassName="t-modal is-open ui-dialog-surface w-[70vw] h-[90vh] rounded-[14px] flex flex-col overflow-hidden"
      ariaLabelledBy="full-history-modal-title"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-divider bg-bg-elevated shrink-0">
        <h3 id="full-history-modal-title" className="font-semibold text-text text-[14px]">
          {t("chat.fullHistoryTitle")}
        </h3>
        <button
          onClick={onClose}
          aria-label={t("common.close")}
          className="text-text-muted hover:text-text text-[18px] leading-none px-2 py-1 cursor-pointer"
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
          {loading && (
            <div className="text-[13px] text-text-muted py-8 text-center">{t("chat.fullHistoryLoading")}</div>
          )}
          {!loading && error && (
            <div className="p-2.5 rounded-control bg-red-500/10 border border-red-500/20 text-red-400 text-[12px]">
              {t("chat.fullHistoryError")}: {error}
            </div>
          )}
          {!loading && !error && messages && (
            <div className="flex flex-col gap-1">
              {messages.map((msg, idx) => {
                const view = (
                  <MessageView
                    message={msg}
                    toolResults={toolResultsMap}
                    entryId={entryIds[idx]}
                    showTimestamp
                  />
                );
                if (msg.role !== "user" && msg.role !== "assistant") {
                  return <div key={entryIds[idx] ?? `idx-${idx}`}>{view}</div>;
                }
                const currentRefIdx = refIdx++;
                return (
                  <div
                    key={entryIds[idx] ?? `idx-${idx}`}
                    ref={(el) => {
                      messageRefs.current[currentRefIdx] = el;
                    }}
                    style={{ contentVisibility: "auto", containIntrinsicSize: "auto 150px" }}
                  >
                    {view}
                  </div>
                );
              })}
              {messages.length === 0 && (
                <div className="text-[13px] text-text-muted py-8 text-center">{t("chat.fullHistoryEmpty")}</div>
              )}
            </div>
          )}
        </div>
        {messages && messages.length > 0 && (
          <ChatMinimap
            messages={messages}
            streamingMessage={null}
            scrollContainer={scrollRef}
            messageRefs={messageRefs}
          />
        )}
      </div>
    </ModalSurface>
  );
}
