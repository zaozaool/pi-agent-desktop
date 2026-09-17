"use client";

import React, { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "./I18nProvider";

export interface LightboxImage {
  src: string;
  alt?: string;
}

export interface ImageLightboxProps {
  images: LightboxImage[];
  index: number;
  onClose: () => void;
  onNavigate?: (index: number) => void;
}

/**
 * Full-screen image viewer for message images. Renders in a portal so it
 * escapes any transform/filter stacking contexts inside the chat scroll area.
 * Closes on backdrop click or Escape; arrow keys / buttons navigate when the
 * message carries multiple images.
 */
export function ImageLightbox({ images, index, onClose, onNavigate }: ImageLightboxProps) {
  const { t } = useI18n();
  const hasMultiple = images.length > 1 && !!onNavigate;
  const current = images[index];

  const prev = useCallback(() => {
    onNavigate?.((index - 1 + images.length) % images.length);
  }, [index, images.length, onNavigate]);

  const next = useCallback(() => {
    onNavigate?.((index + 1) % images.length);
  }, [index, images.length, onNavigate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (hasMultiple && e.key === "ArrowLeft") {
        prev();
      } else if (hasMultiple && e.key === "ArrowRight") {
        next();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [hasMultiple, next, onClose, prev]);

  if (!current) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("lightbox.title")}
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/85 cursor-zoom-out select-none"
      onClick={onClose}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={current.src}
        alt={current.alt ?? ""}
        draggable={false}
        className="max-w-[94vw] max-h-[94vh] object-contain rounded-md shadow-2xl cursor-default"
        onClick={(e) => e.stopPropagation()}
      />
      {hasMultiple && (
        <>
          <button
            type="button"
            aria-label={t("lightbox.prev")}
            title={t("lightbox.prev")}
            className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-9 h-9 rounded-full bg-white/10 text-white hover:bg-white/25 border-none cursor-pointer transition-colors duration-120"
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            type="button"
            aria-label={t("lightbox.next")}
            title={t("lightbox.next")}
            className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-9 h-9 rounded-full bg-white/10 text-white hover:bg-white/25 border-none cursor-pointer transition-colors duration-120"
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          <span className="absolute bottom-4 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full bg-black/50 text-white text-[12px] tabular-nums">
            {index + 1} / {images.length}
          </span>
        </>
      )}
    </div>,
    document.body
  );
}
