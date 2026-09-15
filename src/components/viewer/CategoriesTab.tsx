"use client";
import { useMemo } from "react";
import { useT, useViewer, useViewerState } from "./context";
import { Icon } from "./icons";

export function CategoriesTab() {
  const { controller } = useViewer();
  const s = useViewerState();
  const t = useT();
  const b = s.bundle;
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of b.exhibitors) for (const c of e.categoryIds) m.set(c, (m.get(c) ?? 0) + 1);
    return m;
  }, [b]);
  const cats = useMemo(() => [...b.categories].sort((a, c) => a.sortIndex - c.sortIndex || a.name.localeCompare(c.name)), [b]);
  if (!cats.length) return <p className="tv-muted p-4">{t("noCategories")}</p>;
  return (
    <div className="tv-panel-content tv-scrollbar">
      <div className="px-3 py-2 flex items-center justify-between gap-2">
        <span className="tv-muted text-xs">{t("filterByCategory")}</span>
        {s.categoryIds.length > 0 && <button type="button" className="tv-btn tv-btn-ghost tv-btn-sm" onClick={() => controller.clearCategory()}>{t("clearFilter")}</button>}
      </div>
      <ul className="m-0 p-0 list-none" role="listbox" aria-multiselectable="true" aria-label={t("categories")}>
        {cats.map((c) => {
          const on = s.categoryIds.includes(c.id);
          return (
            <li key={c.id}>
              <button type="button" role="option" aria-selected={on} className="tv-row" onClick={() => controller.selectCategory(c.id, { toggle: true })}>
                <span className="tv-chip-dot" style={{ width: 14, height: 14, background: c.color ?? "var(--tv-primary)" }} />
                <span className="flex-1 truncate font-medium">{c.name}</span>
                <span className="tv-muted text-xs">{t("categoryCount", { n: counts.get(c.id) ?? 0 })}</span>
                <span className="tv-icon-btn !w-7 !h-7 !rounded-md" aria-hidden="true" data-active={on ? "1" : undefined}>{on && <Icon name="check" size={16} />}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
