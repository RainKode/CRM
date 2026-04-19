"use client";

import { useState, useCallback, useRef } from "react";

declare global {
  interface Window {
    documentPictureInPicture?: {
      requestWindow(options?: {
        width?: number;
        height?: number;
        disallowReturnToOpener?: boolean;
        preferInitialWindowPlacement?: boolean;
      }): Promise<Window>;
      window: Window | null;
    };
  }
}

function copyStylesToWindow(targetWindow: Window) {
  // Copy all <link rel="stylesheet"> and <style> elements
  const sourceDoc = document;
  const targetDoc = targetWindow.document;

  // Copy via StyleSheets API for robustness
  Array.from(sourceDoc.styleSheets).forEach((sheet) => {
    try {
      if (sheet.href) {
        const link = targetDoc.createElement("link");
        link.rel = "stylesheet";
        link.href = sheet.href;
        targetDoc.head.appendChild(link);
      } else {
        const cssText = Array.from(sheet.cssRules)
          .map((r) => r.cssText)
          .join("\n");
        const style = targetDoc.createElement("style");
        style.textContent = cssText;
        targetDoc.head.appendChild(style);
      }
    } catch {
      // Cross-origin or inaccessible sheet — skip
    }
  });

  // Also copy inline <style> tags (catches Tailwind @theme blocks)
  Array.from(sourceDoc.querySelectorAll("style")).forEach((el) => {
    const clone = el.cloneNode(true);
    targetDoc.head.appendChild(clone);
  });

  // Mirror html class names (dark mode etc.)
  targetDoc.documentElement.className = sourceDoc.documentElement.className;

  // Base body styles
  targetDoc.body.style.cssText = `
    margin: 0;
    padding: 0;
    overflow: hidden;
    background: var(--color-bg);
    color: var(--color-fg);
    font-family: var(--font-sans, system-ui, sans-serif);
    font-size: 14px;
    -webkit-font-smoothing: antialiased;
  `;
}

export interface UseEnrichmentPipReturn {
  pipWindow: Window | null;
  isOpening: boolean;
  snapBack: boolean;
  isSupported: boolean;
  openPip: (opts?: { width?: number; height?: number }) => Promise<void>;
  closePip: () => void;
}

export function useEnrichmentPip(): UseEnrichmentPipReturn {
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [snapBack, setSnapBack] = useState(false);
  const snapBackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSupported =
    typeof window !== "undefined" &&
    "documentPictureInPicture" in window;

  const openPip = useCallback(
    async (opts?: { width?: number; height?: number }) => {
      if (!window.documentPictureInPicture) return;
      setIsOpening(true);

      try {
        const pip = await window.documentPictureInPicture.requestWindow({
          width: opts?.width ?? 440,
          height: opts?.height ?? 720,
          preferInitialWindowPlacement: true,
        });

        copyStylesToWindow(pip);

        // Snap back when PiP window closes for any reason
        pip.addEventListener("pagehide", () => {
          setPipWindow(null);
          if (snapBackTimer.current) clearTimeout(snapBackTimer.current);
          setSnapBack(true);
          snapBackTimer.current = setTimeout(() => setSnapBack(false), 700);
        });

        setPipWindow(pip);
      } catch (err) {
        // User cancelled or feature unavailable — no-op
        console.warn("PiP open failed:", err);
      } finally {
        setIsOpening(false);
      }
    },
    []
  );

  const closePip = useCallback(() => {
    if (pipWindow && !pipWindow.closed) {
      pipWindow.close();
    }
  }, [pipWindow]);

  return { pipWindow, isOpening, snapBack, isSupported, openPip, closePip };
}
