"use client";

import { useState, useCallback, useEffect, useRef } from "react";

/**
 * Hook for Document Picture-in-Picture API.
 * Creates an always-on-top floating window for the enrichment form.
 * Falls back gracefully if browser doesn't support it.
 */
export function usePopout() {
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);
  const [isAnimatingIn, setIsAnimatingIn] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const isSupported =
    typeof window !== "undefined" &&
    "documentPictureInPicture" in window;

  const isOpen = !!pipWindow;

  const openPopout = useCallback(
    async (width = 420, height = 720) => {
      if (!isSupported) return;

      // Animate out
      setIsAnimatingOut(true);
      await new Promise((r) => setTimeout(r, 280));

      try {
        const pip = await (
          window as unknown as {
            documentPictureInPicture: {
              requestWindow: (opts: {
                width: number;
                height: number;
              }) => Promise<Window>;
            };
          }
        ).documentPictureInPicture.requestWindow({ width, height });

        // Copy all stylesheets into PiP window
        const styles = document.querySelectorAll(
          'style, link[rel="stylesheet"]'
        );
        for (const node of styles) {
          pip.document.head.appendChild(node.cloneNode(true));
        }

        // Set the theme class on the PiP body
        const themeClass = document.documentElement.classList.contains("light")
          ? "light"
          : "dark";
        pip.document.documentElement.classList.add(themeClass);
        pip.document.body.style.margin = "0";
        pip.document.body.style.background = "var(--color-bg)";
        pip.document.body.style.color = "var(--color-fg)";
        pip.document.body.style.fontFamily =
          'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
        pip.document.body.style.fontSize = "103%";
        pip.document.body.style.letterSpacing = "-0.011em";
        pip.document.body.style.setProperty(
          "-webkit-font-smoothing",
          "antialiased"
        );

        // Listen for close
        pip.addEventListener("pagehide", () => {
          setIsAnimatingIn(true);
          setPipWindow(null);
          setTimeout(() => setIsAnimatingIn(false), 350);
        });

        setPipWindow(pip);
        setIsAnimatingOut(false);
      } catch {
        setIsAnimatingOut(false);
      }
    },
    [isSupported]
  );

  const closePopout = useCallback(() => {
    if (pipWindow) {
      setIsAnimatingIn(true);
      pipWindow.close();
      setPipWindow(null);
      setTimeout(() => setIsAnimatingIn(false), 350);
    }
  }, [pipWindow]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      pipWindow?.close();
    };
  }, [pipWindow]);

  return {
    isSupported,
    isOpen,
    isAnimatingOut,
    isAnimatingIn,
    pipWindow,
    containerRef,
    openPopout,
    closePopout,
  };
}
