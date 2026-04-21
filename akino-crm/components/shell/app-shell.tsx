import { Suspense } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { CommandPalette } from "./command-palette";
import { KeyboardShortcutsOverlay } from "./keyboard-shortcuts-overlay";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-(--color-bg)">
      <Suspense>
        <Sidebar />
      </Suspense>
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
      <CommandPalette />
      <KeyboardShortcutsOverlay />
    </div>
  );
}
