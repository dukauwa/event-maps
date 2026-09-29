"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { DEMO_SLUG } from "./site-header";

const VIEWS = [
  {
    label: "Design the floor",
    short: "Designer",
    image: "designer",
    alt: "Tessera floor plan designer with booth inventory, a hall layout and booth properties",
    caption: "Every booth, every hall, every detail. In your hands.",
    href: "/admin",
    cta: "Open the organiser portal",
  },
  {
    label: "Sell the space",
    short: "Booking",
    image: "booking",
    alt: "Booth A106 selected on the booking map, with dimensions, pricing and a reservation button",
    caption: "Give exhibitors a clear view of their next great spot.",
    href: `/e/${DEMO_SLUG}/book`,
    cta: "Explore the booking demo",
  },
  {
    label: "Guide the crowd",
    short: "Attendees",
    image: "attendee",
    alt: "Attendee floor plan with searchable exhibitors, hall levels and map controls",
    caption: "Help people find the places and connections that matter.",
    href: `/e/${DEMO_SLUG}`,
    cta: "Explore the attendee demo",
  },
  {
    label: "See the big picture",
    short: "Dashboard",
    image: "dashboard",
    alt: "Organiser dashboard showing demo booth sales, availability and visitor analytics",
    caption: "Your event’s inventory and activity, together at a glance.",
    href: "/admin",
    cta: "Open the organiser portal",
  },
];

export function ProductShowcase() {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const view = VIEWS[active];

  return (
    <div className="product-showcase">
      <div
        className="showcase-tabs"
        role="tablist"
        aria-label="Explore the product"
      >
        {VIEWS.map((item, index) => (
          <button
            key={item.image}
            ref={(node) => {
              tabs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`product-tab-${index}`}
            aria-selected={active === index}
            aria-controls="product-preview"
            tabIndex={active === index ? 0 : -1}
            onClick={() => setActive(index)}
            onKeyDown={(event) => {
              let next = active;
              if (event.key === "ArrowRight")
                next = (active + 1) % VIEWS.length;
              else if (event.key === "ArrowLeft")
                next = (active - 1 + VIEWS.length) % VIEWS.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = VIEWS.length - 1;
              else return;
              event.preventDefault();
              setActive(next);
              tabs.current[next]?.focus();
            }}
          >
            <span className="tab-number" aria-hidden="true">
              0{index + 1}
            </span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <div
        id="product-preview"
        role="tabpanel"
        aria-labelledby={`product-tab-${active}`}
        tabIndex={0}
      >
        <div className="product-window">
          <div className="window-bar">
            <span className="window-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>
              {view.short} <span className="window-divider">/</span> Grip
              Connect 2026
            </span>
            <span className="demo-tag">Demo event</span>
          </div>
          <Image
            key={view.image}
            src={`/images/product/${view.image}.png`}
            alt={view.alt}
            width={1280}
            height={720}
            sizes="(max-width: 768px) 94vw, 1120px"
            preload={active === 0}
            className="product-screen"
          />
        </div>
        <div className="showcase-caption">
          <p>{view.caption}</p>
          <a href={view.href}>
            {view.cta} <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>
    </div>
  );
}
