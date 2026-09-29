"use client";

import { useRef } from "react";

/** Keep native details behaviour, and dismiss the menu after in-page navigation. */
export function MobileMenu({ children }: { children: React.ReactNode }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);

  return (
    <details
      ref={menu}
      className="group relative ml-auto md:hidden"
      onKeyDown={(event) => {
        if (event.key === "Escape" && menu.current?.open) {
          menu.current.open = false;
          trigger.current?.focus();
        }
      }}
    >
      <summary
        ref={trigger}
        className="grid size-9 cursor-pointer list-none place-items-center rounded-lg border border-border text-gray-700 [&::-webkit-details-marker]:hidden"
        aria-label="Menu"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </summary>
      <nav
        aria-label="Mobile navigation"
        className="absolute right-0 top-11 w-60 rounded-xl border border-border bg-white p-2 shadow-[var(--shadow-pop)]"
        onClick={(event) => {
          if ((event.target as Element).closest("a") && menu.current)
            menu.current.open = false;
        }}
      >
        {children}
      </nav>
    </details>
  );
}
