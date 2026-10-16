"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { primaryNavigation } from "@/lib/navigation";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);

  return (
    <>
      <button className="command-trigger" onClick={() => setOpen(true)} aria-haspopup="dialog">
        Jump to <kbd>⌘K</kbd>
      </button>
      <dialog ref={dialog} className="command" onClose={() => setOpen(false)} aria-label="Navigate the dashboard">
        <div className="command__head"><span>Go to</span><button onClick={() => setOpen(false)}>Esc</button></div>
        <div className="command__list">
          {primaryNavigation.map((item) => (
            <button key={item.href} onClick={() => { router.push(item.href); setOpen(false); }}>
              <span>{item.label}</span><kbd>{item.shortcut}</kbd>
            </button>
          ))}
        </div>
      </dialog>
    </>
  );
}
