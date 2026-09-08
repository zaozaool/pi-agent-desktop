"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseChatScrollOptions {
  messageCount: number;
  agentRunning: boolean;
  streamingMessage?: unknown;
  /** Saved scrollTop of the previous view of this session (restored on load). */
  initialScrollTop?: number | null;
  /** Called with the container's scrollTop as it changes (throttled by scroll events). */
  onScrollSave?: (scrollTop: number) => void;
}

export function useChatScroll({
  messageCount,
  agentRunning,
  streamingMessage,
  initialScrollTop,
  onScrollSave,
}: UseChatScrollOptions) {
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [containerNode, setContainerNode] = useState<HTMLDivElement | null>(null);
  const pendingScrollToUserRef = useRef(false);
  const initialScrollDoneRef = useRef(false);
  const isAtBottomRef = useRef(true);
  // Captured at mount; ChatWindow remounts per session switch, so a fresh hook
  // instance always sees the correct per-session value.
  const initialScrollTopRef = useRef(initialScrollTop);
  const onScrollSaveRef = useRef(onScrollSave);
  onScrollSaveRef.current = onScrollSave;

  const setScrollContainer = useCallback((node: HTMLDivElement | null) => {
    scrollContainerRef.current = node;
    setContainerNode(node);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  const handleScroll = useCallback(() => {
    const container = containerNode;
    if (!container) return;
    const distanceToBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    // Consider user at bottom if within 80px of bottom
    isAtBottomRef.current = distanceToBottom < 80;
    onScrollSaveRef.current?.(container.scrollTop);
  }, [containerNode]);

  // Track user scroll position on the active container node
  useEffect(() => {
    if (!containerNode) return;
    handleScroll();
    containerNode.addEventListener("scroll", handleScroll, { passive: true });
    return () => containerNode.removeEventListener("scroll", handleScroll);
  }, [containerNode, handleScroll]);

  // Initial load: restore the saved scroll position (same session revisited),
  // otherwise scroll to bottom once the container + messages are ready.
  useEffect(() => {
    if (messageCount <= 0 || !containerNode) return;
    if (!initialScrollDoneRef.current) {
      initialScrollDoneRef.current = true;
      const saved = initialScrollTopRef.current;
      if (saved != null) {
        containerNode.scrollTop = saved;
        const dist = containerNode.scrollHeight - saved - containerNode.clientHeight;
        isAtBottomRef.current = dist < 80;
      } else {
        isAtBottomRef.current = true;
        scrollToBottom("auto");
      }
    }
  }, [messageCount, containerNode, scrollToBottom]);

  // When user sends a message, scroll down and lock to bottom
  useEffect(() => {
    if (pendingScrollToUserRef.current) {
      pendingScrollToUserRef.current = false;
      initialScrollDoneRef.current = true;
      isAtBottomRef.current = true;
      scrollToBottom("smooth");
    }
  }, [messageCount, scrollToBottom]);

  // During streaming/thinking/tool execution, auto-scroll to bottom if user is at bottom
  useEffect(() => {
    if (agentRunning && isAtBottomRef.current) {
      scrollToBottom("auto");
    }
  }, [streamingMessage, messageCount, agentRunning, scrollToBottom]);

  // When the agent settles or the transcript changes while at the bottom,
  // smoothly follow the new context without interrupting manual history review.
  useEffect(() => {
    if (!agentRunning && initialScrollDoneRef.current && isAtBottomRef.current) {
      scrollToBottom("smooth");
    }
  }, [agentRunning, messageCount, scrollToBottom]);

  return {
    messagesEndRef,
    scrollContainerRef,
    setScrollContainer,
    pendingScrollToUserRef,
    initialScrollDoneRef,
    scrollToBottom,
  };
}
