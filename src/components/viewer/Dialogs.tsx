"use client";
import { useEffect, useRef, useState } from "react";
import { LOCALE_NAMES } from "@/lib/i18n";
import { useT, useViewer, useViewerState } from "./context";
import { Icon } from "./icons";

/** QR code rendered client-side with the `qrcode` package (lazy-loaded). */
export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    import("qrcode").then((qr) => qr.toDataURL(value, { width: size, margin: 1, errorCorrectionLevel: "M" })).then((url) => { if (alive) setSrc(url); }).catch(() => { if (alive) setSrc(null); });
    return () => { alive = false; };
  }, [value, size]);
  if (!src) return <div style={{ width: size, height: size }} className="tv-card flex items-center justify-center"><span className="tv-spinner" /></div>;
  // eslint-disable-next-line @next/next/no-img-element -- data URL generated on the client
  return <img src={src} width={size} height={size} alt="QR code" style={{ borderRadius: 12, background: "#fff" }} />;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button, [href], input")?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="tv-dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className="tv-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-lg font-semibold m-0">{title}</h2>
          <button type="button" className="tv-icon-btn" onClick={onClose} aria-label={t("close")}><Icon name="close" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Dialogs() {
  const { controller } = useViewer();
  const s = useViewerState();
  const t = useT();
  const [copied, setCopied] = useState(false);
  const d = s.dialog;
  const [prevDialog, setPrevDialog] = useState(d);
  if (d !== prevDialog) { setPrevDialog(d); setCopied(false); }
  if (!d) return null;
  const close = () => controller.closeDialog();

  if (d.kind === "language") {
    const langs = s.bundle.event.settings.languages.length ? s.bundle.event.settings.languages : [s.bundle.event.settings.locale];
    return (
      <Modal title={t("language")} onClose={close}>
        <ul className="m-0 p-0 list-none flex flex-col gap-1" role="listbox" aria-label={t("language")}>
          {langs.map((l) => (
            <li key={l}>
              <button type="button" role="option" aria-selected={l === s.locale} className="tv-row rounded-lg" aria-current={l === s.locale} onClick={() => controller.setLanguage(l)}>
                <span className="flex-1">{LOCALE_NAMES[l]}</span>
                {l === s.locale && <Icon name="check" />}
              </button>
            </li>
          ))}
        </ul>
      </Modal>
    );
  }

  const copy = async () => {
    try { await navigator.clipboard.writeText(d.url); setCopied(true); } catch { setCopied(false); }
  };
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function" && !s.kiosk;
  return (
    <Modal title={d.kind === "qr" ? (d.title || t("openLink")) : t("share")} onClose={close}>
      <div className="flex flex-col items-center gap-3">
        <QrCode value={d.url} />
        <p className="tv-muted text-center m-0">{d.kind === "qr" && s.kiosk ? t("kioskNoLinks") : t("qrHint")}</p>
        {!s.kiosk && (
          <div className="w-full flex gap-2">
            <input className="tv-input" readOnly value={d.url} onFocus={(e) => e.currentTarget.select()} aria-label={t("copyLink")} />
            <button type="button" className="tv-btn tv-btn-outline" onClick={copy}><Icon name={copied ? "check" : "copy"} />{copied ? t("linkCopied") : t("copy")}</button>
          </div>
        )}
        {canShare && <button type="button" className="tv-btn tv-btn-primary w-full" onClick={() => navigator.share({ title: d.title, url: d.url }).then(close).catch(() => undefined)}><Icon name="share" />{t("share")}</button>}
      </div>
    </Modal>
  );
}
