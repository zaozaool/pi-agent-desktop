"use client";

import { useEffect, useRef, useState, useCallback, useMemo, RefObject } from "react";
import type { AgentMessage, AssistantMessage, TextContent } from "@/lib/types";

interface Props {
  messages: AgentMessage[];
  streamingMessage: Partial<AgentMessage> | null;
  scrollContainer: RefObject<HTMLDivElement | null>;
  messageRefs: RefObject<(HTMLDivElement | null)[]>;
}

const MINIMAP_WIDTH = 30;

function getMessagePreview(msg: AgentMessage | Partial<AgentMessage>): string {
  if (msg.role === "user") {
    const content = msg.content;
    if (typeof content === "string") return content.slice(0, 200);
    if (Array.isArray(content)) {
      return (content as { type: string; text?: string }[])
        .filter((b) => b.type === "text" && b.text)
        .map((b) => b.text!)
        .join("\n")
        .slice(0, 200);
    }
    return "";
  }
  if (msg.role === "assistant") {
    const blocks = (msg as Partial<AssistantMessage>).content ?? [];
    const text = blocks
      .filter((b): b is TextContent => b.type === "text")
      .map((b) => b.text)
      .join(" ");
    if (text) return text.slice(0, 200);
    const toolNames = blocks
      .filter((b) => b.type === "toolCall")
      .map((b) => (b as { type: string; toolName: string }).toolName);
    if (toolNames.length) return toolNames.join(", ");
    return "";
  }
  return "";
}

function getNodeColor(msg: AgentMessage | Partial<AgentMessage>): { bg: string; border: string } {
  if (msg.role === "user") {
    return { bg: "var(--user-bg)", border: "var(--user-border)" };
  }
  return { bg: "var(--bg-subtle)", border: "var(--border)" };
}

function hasTextContent(msg: AgentMessage | Partial<AgentMessage>): boolean {
  if (msg.role === "user") return true;
  if (msg.role === "assistant") {
    const blocks = (msg as Partial<AssistantMessage>).content ?? [];
    return blocks.some((b) => b.type === "text");
  }
  return false;
}

interface NodeInfo {
  topRatio: number;   // 0–1 within total scroll height
  heightRatio: number;
  msg: AgentMessage | Partial<AgentMessage>;
  index: number;
}

export function ChatMinimap({ messages, streamingMessage, scrollContainer, messageRefs }: Props) {
  const [scrollRatio, setScrollRatio] = useState(0);
  const [viewportRatio, setViewportRatio] = useState(1);
  const [visible, setVisible] = useState(false);
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [minimapHovered, setMinimapHovered] = useState(false);
  const [mouseYRatio, setMouseYRatio] = useState<number | null>(null);
  const draggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const allMessages = useMemo(
    () => (streamingMessage ? [...messages, streamingMessage] : messages) as (AgentMessage | Partial<AgentMessage>)[],
    [messages, streamingMessage]
  );
  const allMessagesRef = useRef(allMessages);
  allMessagesRef.current = allMessages;

  const updatePositionsRef = useRef<() => void>(null!);
  updatePositionsRef.current = () => {
    const scrollEl = scrollContainer.current;
    if (!scrollEl) return;

    const totalH = scrollEl.scrollHeight;
    const clientH = scrollEl.clientHeight;
    const scrollable = totalH - clientH;

    setVisible(scrollable > 20);
    if (scrollable <= 0) {
      setScrollRatio(0);
      setViewportRatio(1);
    } else {
      setScrollRatio(scrollEl.scrollTop / scrollable);
      setViewportRatio(clientH / totalH);
    }

    // Build node positions from real DOM refs
    const refs = messageRefs.current;
    const newNodes: NodeInfo[] = [];
    let refIndex = 0;

    const allMessages = allMessagesRef.current;
    for (let i = 0; i < allMessages.length; i++) {
      const msg = allMessages[i];
      if (msg.role !== "user" && msg.role !== "assistant") continue;

      const el = refs?.[refIndex];
      refIndex++;

      if (!hasTextContent(msg)) continue;

      if (el && totalH > 0) {
        const elRect = el.getBoundingClientRect();
        const containerRect = scrollEl.getBoundingClientRect();
        const top = elRect.top - containerRect.top + scrollEl.scrollTop;
        const h = elRect.height;
        newNodes.push({
          topRatio: top / totalH,
          heightRatio: h / totalH,
          msg,
          index: newNodes.length,
        });
      }
    }
    setNodes(newNodes);
  };

  const updatePositions = useCallback(() => updatePositionsRef.current(), []);

  useEffect(() => {
    const el = scrollContainer.current;
    if (!el) return;
    el.addEventListener("scroll", updatePositions, { passive: true });
    const ro = new ResizeObserver(updatePositions);
    ro.observe(el);
    // Also observe the scroll content for height changes
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    updatePositions();
    return () => {
      el.removeEventListener("scroll", updatePositions);
      ro.disconnect();
    };
  }, [scrollContainer, updatePositions]);

  // Re-measure when message count changes (new messages arrive)
  useEffect(() => {
    const t = setTimeout(updatePositions, 50);
    return () => clearTimeout(t);
  }, [messages.length, updatePositions]);

  const scrollToMinimapRatio = useCallback((viewportTopRatio: number) => {
    const el = scrollContainer.current;
    if (!el) return;
    const scrollable = el.scrollHeight - el.clientHeight;
    if (scrollable <= 0) return;
    const clamped = Math.max(0, Math.min(1 - viewportRatio, viewportTopRatio));
    el.scrollTop = (clamped / (1 - viewportRatio)) * scrollable;
  }, [scrollContainer, viewportRatio]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!visible) return;

    draggingRef.current = true;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickRatio = (e.clientY - rect.top) / rect.height;
    const grabOffset = clickRatio - scrollRatio * (1 - viewportRatio);
    const insideBox = grabOffset >= 0 && grabOffset <= viewportRatio;
    const offset = insideBox ? grabOffset : viewportRatio / 2;

    scrollToMinimapRatio(clickRatio - offset);

    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const r = (ev.clientY - rect.top) / rect.height;
      scrollToMinimapRatio(r - offset);
    };
    const onUp = () => {
      draggingRef.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [visible, viewportRatio, scrollRatio, scrollToMinimapRatio]);



  // Measure minimap height reactively. Reading containerRef.current.clientHeight
  // directly during render would return null on first mount (falling back to 600
  // and causing tooltip miscalculation on the first hover). useState + useEffect
  // gives us the real value after mount, and ResizeObserver keeps it in sync on
  // window resize / sidebar toggle.
  const [minimapHeightPx, setMinimapHeightPx] = useState(600);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Measure immediately so the second render already uses the real height.
    setMinimapHeightPx(el.clientHeight);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = entry.contentRect.height;
        if (height > 0) setMinimapHeightPx(height);
      }
    });
    observer.observe(el);

    return () => observer.disconnect();
    // mount-only: containerRef is a stable object
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Proportional tooltip layout: each card's height mirrors the real message
  // height (heightRatio * minimap height, min one text line). Cards keep their
  // mirrored top position; overlaps are pushed apart. The whole stack then
  // scrolls vertically following the mouse when it is taller than the minimap.
  const TOOLTIP_MIN_HEIGHT = 22;
  const TOOLTIP_GAP = 2;
  const TOOLTIP_PAD = 6; // breathing room at the top/bottom of the minimap

  const tooltipLayout = useMemo(() => {
    if (!minimapHovered || nodes.length === 0) return null;
    const cards = nodes.map((node) => {
      const height = Math.max(TOOLTIP_MIN_HEIGHT, node.heightRatio * minimapHeightPx);
      return { top: node.topRatio * minimapHeightPx - height / 2, height };
    });
    // Push apart overlapping cards (top-down then bottom-up passes)
    for (let pass = 0; pass < 10; pass++) {
      for (let i = 1; i < cards.length; i++) {
        const minTop = cards[i - 1].top + cards[i - 1].height + TOOLTIP_GAP;
        if (cards[i].top < minTop) cards[i].top = minTop;
      }
      for (let i = cards.length - 2; i >= 0; i--) {
        const maxTop = cards[i + 1].top - cards[i].height - TOOLTIP_GAP;
        if (cards[i].top > maxTop) cards[i].top = maxTop;
      }
    }
    // Normalize so the first card starts below the top padding
    const firstTop = cards[0].top;
    if (firstTop !== TOOLTIP_PAD) {
      for (const card of cards) card.top -= firstTop - TOOLTIP_PAD;
    }
    const stackHeight = cards[cards.length - 1].top + cards[cards.length - 1].height;
    return { cards, stackHeight };
  }, [minimapHovered, nodes, minimapHeightPx]);

  // Scroll the tooltip stack so the card nearest the mouse stays under the
  // cursor; clamped so the stack never leaves the minimap bounds.
  const tooltipScrollOffset = useMemo(() => {
    if (!tooltipLayout || mouseYRatio === null) return 0;
    const { cards, stackHeight } = tooltipLayout;
    // Keep the stack inside [TOOLTIP_PAD, minimapHeightPx - TOOLTIP_PAD]:
    // offset 0 when it fits, otherwise scroll within clamped bounds.
    const lo = Math.min(0, minimapHeightPx - 2 * TOOLTIP_PAD - stackHeight);
    if (lo === 0) return 0;

    // Nearest node to the mouse
    let nearest = 0;
    for (let i = 1; i < nodes.length; i++) {
      if (Math.abs(nodes[i].topRatio - mouseYRatio) < Math.abs(nodes[nearest].topRatio - mouseYRatio)) {
        nearest = i;
      }
    }
    const card = cards[nearest];
    if (!card) return 0;
    const cardCenter = card.top + card.height / 2;
    const mouseY = mouseYRatio * minimapHeightPx;
    const offset = mouseY - cardCenter;
    return Math.max(lo, Math.min(0, offset));
  }, [tooltipLayout, mouseYRatio, nodes, minimapHeightPx]);

  if (!visible) return null;

  const viewportBoxTop = scrollRatio * (1 - viewportRatio) * 100;
  const viewportBoxHeight = viewportRatio * 100;

  // Find the node closest to the current mouse position
  const nearestIndex = mouseYRatio !== null && nodes.length > 0
    ? nodes.reduce((best, node) => {
        return Math.abs(node.topRatio - mouseYRatio) < Math.abs(nodes[best].topRatio - mouseYRatio) ? node.index : best;
      }, 0)
    : null;

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setMinimapHovered(true)}
      onMouseLeave={() => { setMinimapHovered(false); setMouseYRatio(null); }}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setMouseYRatio((e.clientY - rect.top) / rect.height);
      }}
      style={{
        width: MINIMAP_WIDTH,
        flexShrink: 0,
        position: "relative",
        cursor: "default",
        userSelect: "none",
        borderLeft: "1px solid var(--divider)",
        background: "var(--bg-elevated)",
        overflow: "visible",
      }}
    >
      {/* Viewport indicator */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: `${viewportBoxTop}%`,
          height: `${viewportBoxHeight}%`,
          background: "var(--bg-subtle)",
          borderTop: "1px solid var(--border-subtle)",
          borderBottom: "1px solid var(--border-subtle)",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />

      {/* Message nodes */}
      {nodes.map((node) => {
        const color = getNodeColor(node.msg);
        const isNearest = minimapHovered && nearestIndex === node.index;
        const isUser = node.msg.role === "user";
        const dotTop = node.topRatio * 100;

        return (
          <div
            key={node.index}

            style={{
              position: "absolute",
              top: `${dotTop}%`,
              transform: "translateY(-50%)",
              left: 0,
              right: 0,
              height: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              zIndex: 2,
            }}
          >
            {/* Dot */}
            <div
              style={{
                width: isUser ? 7 : 5,
                height: isUser ? 7 : 5,
                borderRadius: isUser ? 2 : "50%",
                background: color.bg,
                border: `1.5px solid ${color.border}`,
                flexShrink: 0,
                transition: "transform 0.1s",
                transform: isNearest ? "scale(1.6)" : "scale(1)",
              }}
            />


          </div>
        );
      })}

      {/* Center line */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 0,
          bottom: 0,
          width: 1,
          background: "var(--border)",
          transform: "translateX(-50%)",
          zIndex: 0,
        }}
      />

      {/* Tooltips for all nodes: proportional heights, stack scrolls with mouse */}
      {minimapHovered && tooltipLayout && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            transform: `translateY(${tooltipScrollOffset}px)`,
            transition: "transform 0.15s ease-out",
          }}
        >
          {nodes.map((node, i) => {
            const preview = getMessagePreview(node.msg);
            const color = getNodeColor(node.msg);
            const isNearest = nearestIndex === node.index;
            const isUser = node.msg.role === "user";
            if (!preview) return null;
            const card = tooltipLayout.cards[i];
            return (
              <div
                key={node.index}
                style={{
                  position: "absolute",
                  top: card.top,
                  height: card.height,
                  right: "100%",
                  marginRight: 6,
                  background: isUser ? "var(--user-bg)" : "var(--bg-elevated)",
                  borderTop: `1px solid ${isNearest ? color.border : "var(--border)"}`,
                  borderRight: `1px solid ${isNearest ? color.border : "var(--border)"}`,
                  borderBottom: `1px solid ${isNearest ? color.border : "var(--border)"}`,
                  borderLeft: isUser ? "3px solid var(--accent)" : `1px solid ${isNearest ? color.border : "var(--border)"}`,
                  borderRadius: "var(--radius-control)",
                  padding: "2px 7px",
                  width: 200,
                  zIndex: 100,
                  opacity: isNearest ? 1 : 0.45,
                  transition: "top 0.1s, height 0.1s, opacity 0.1s",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  overflow: "hidden",
                }}
              >
                {/* Role icon: person = user, sparkle = assistant */}
                {isUser ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                ) : (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
                  </svg>
                )}
                <div
                  style={{
                    fontSize: 11,
                    color: isNearest ? "var(--text)" : "var(--text-muted)",
                    fontWeight: isUser ? 600 : 400,
                    lineHeight: 1.4,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {preview}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Hook to create a stable array of refs for messages
export function useMessageRefs(count: number): RefObject<(HTMLDivElement | null)[]> {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  refs.current = Array(count).fill(null).map((_, i) => refs.current[i] ?? null);
  return refs;
}
