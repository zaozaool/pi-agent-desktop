"use client";

import React, { useCallback, useState } from "react";
import type { AttachedImage } from "./types";
import { ImageLightbox } from "../ImageLightbox";

interface AttachmentPreviewProps {
  attachedImages: AttachedImage[];
  onRemoveImage: (index: number) => void;
}

export function AttachmentPreview({ attachedImages, onRemoveImage }: AttachmentPreviewProps) {
  // Click a thumbnail to zoom it full-screen; arrow keys / buttons navigate
  // across all images currently attached to the input.
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const closeLightbox = useCallback(() => setLightboxIndex(null), []);
  const lightboxImages = React.useMemo(
    () => attachedImages.map((img) => ({ src: img.previewUrl })),
    [attachedImages]
  );

  if (attachedImages.length === 0) return null;

  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
      {attachedImages.map((img, i) => (
        <div key={i} style={{ position: "relative", flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img.previewUrl}
            alt=""
            onClick={() => setLightboxIndex(i)}
            style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)", display: "block", cursor: "zoom-in" }}
          />
          <button
            onClick={() => onRemoveImage(i)}
            aria-label="Remove"
            style={{
              position: "absolute", top: -4, right: -4,
              width: 16, height: 16, borderRadius: "50%",
              background: "var(--bg-panel)", border: "1px solid var(--border)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", padding: 0, color: "var(--text-muted)",
            }}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="1" y1="1" x2="7" y2="7" /><line x1="7" y1="1" x2="1" y2="7" />
            </svg>
          </button>
        </div>
      ))}
      {lightboxIndex !== null && (
        <ImageLightbox
          images={lightboxImages}
          index={lightboxIndex}
          onClose={closeLightbox}
          onNavigate={setLightboxIndex}
        />
      )}
    </div>
  );
}
