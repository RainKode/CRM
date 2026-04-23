import { Suspense } from "react";
import { ShellChrome } from "./shell-chrome";
import { CommandPalette } from "./command-palette";
import { KeyboardShortcutsOverlay } from "./keyboard-shortcuts-overlay";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense>
        <ShellChrome>{children}</ShellChrome>
      </Suspense>
      <CommandPalette />
      <KeyboardShortcutsOverlay />
    </>
  );
}
