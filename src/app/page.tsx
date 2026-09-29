import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import { SiteHeader, DEMO_SLUG } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { ProductShowcase } from "@/components/marketing/product-showcase";
import "./home.css";

export const metadata: Metadata = {
  title: { absolute: `${BRAND.name} · Make room for a great event` },
  description:
    "Turn your floor plan into a connected event experience. Design your hall, sell booth space and help attendees find their way with Tessera.",
};

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {diagonal ? (
        <path d="M6 18 18 6M6 6h12v12" />
      ) : (
        <path d="M4 12h16m-6-6 6 6-6 6" />
      )}
    </svg>
  );
}

function Check({ children }: { children: React.ReactNode }) {
  return (
    <li>
      <span className="feature-check" aria-hidden="true">
        ✓
      </span>
      {children}
    </li>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="section-label">
      <span aria-hidden="true" />
      {children}
    </p>
  );
}

function ProductImage({
  name,
  alt,
  caption,
}: {
  name: string;
  alt: string;
  caption: string;
}) {
  return (
    <figure className={`feature-visual visual-${name}`}>
      <div className="mini-window">
        <div className="mini-window-bar">
          <span aria-hidden="true">● ● ●</span>
          <span>{caption}</span>
        </div>
        <Image
          src={`/images/product/${name}.png`}
          alt={alt}
          width={1280}
          height={720}
          sizes="(max-width: 900px) 94vw, 650px"
        />
      </div>
      <figcaption>Grip Connect 2026 · Demo event</figcaption>
    </figure>
  );
}

const FAQ = [
  [
    "Can I use the floor plan I already have?",
    "Yes. Upload a PDF, image or SVG in the event wizard, review the detected booths, then refine the layout in the designer. You can adjust booth numbers, shapes and exhibitor assignments before publishing.",
  ],
  [
    "Can exhibitors choose and book their own stands?",
    "Yes. A dedicated booking map shows stand availability, dimensions and prices. Exhibitors can choose a stand and reserve it. Your event’s sales settings control reservation, payment and invoice options.",
  ],
  [
    "How do attendees find their way around?",
    "Attendees can search exhibitors and booths, browse categories, save favourites and get directions. The map supports multiple levels and accessible routes, so visitors can plan their visit before they arrive.",
  ],
  [
    "Will it work on our website or in our event app?",
    "Yes. Embed the map with an iframe or use the JavaScript SDK to connect it to your website or event app. Your team can use the API and webhooks for deeper integrations.",
  ],
  [
    "We use ExpoFP. Can we switch?",
    "Tessera includes ExpoFP-compatible data endpoints and SDK methods to help with migration. Import your existing plan, reconnect your integration and test the workflows you use. Our migration guide explains what to check.",
  ],
];

export default function Home() {
  return (
    <div className="marketing-home">
      <a className="skip-home" href="#main-content">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main-content">
        <section className="home-hero">
          <div className="hero-grid" aria-hidden="true" />
          <div className="home-container hero-copy">
            <a href="#product" className="announcement">
              <span>MEET {BRAND.name.toUpperCase()}</span> One plan. A better
              event. <Arrow diagonal />
            </a>
            <h1>
              Make room for
              <br />a <span>great event.</span>
              <svg
                className="hero-spark"
                width="54"
                height="54"
                viewBox="0 0 54 54"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="m27 3 0 48M3 27h48M10 10l34 34M44 10 10 44"
                  stroke="currentColor"
                  strokeWidth="3"
                />
              </svg>
            </h1>
            <p className="hero-description">
              From the first booth to the last connection.
              <br className="desktop-break" /> Design your floor plan, sell your
              space and help everyone find their way.
            </p>
            <div className="hero-actions">
              <Link
                href="/admin/events/new"
                className="home-button primary-button"
              >
                Start with your floor plan <Arrow />
              </Link>
              <a
                href={`/e/${DEMO_SLUG}`}
                className="home-button secondary-button"
              >
                <span className="play-icon" aria-hidden="true">
                  ▷
                </span>{" "}
                Explore the live demo
              </a>
            </div>
            <p className="hero-note">
              <span aria-hidden="true">✓</span> Bring your existing plan{" "}
              <span className="note-dot">·</span> Explore the demo without
              signing in
            </p>
          </div>
          <div className="home-container hero-product">
            <ProductShowcase />
          </div>
        </section>

        <section
          className="event-types"
          aria-label="Built for every kind of gathering"
        >
          <div className="home-container">
            <p>BIG IDEAS NEED A PLACE TO MEET.</p>
            <div>
              <span>Trade shows</span>
              <i aria-hidden="true">✳</i>
              <span>Conferences</span>
              <i aria-hidden="true">✳</i>
              <span>Exhibitions</span>
              <i aria-hidden="true">✳</i>
              <span>Venues</span>
            </div>
          </div>
        </section>

        <section id="product" className="home-section home-container">
          <div className="section-intro">
            <div>
              <Label>A CONNECTED SHOW FLOOR</Label>
              <h2>
                One floor plan.
                <br />
                <span>So many possibilities.</span>
              </h2>
            </div>
            <p>
              The plan shouldn’t stop at a PDF. Give your team, exhibitors and
              attendees their own way into the same event.
            </p>
          </div>
          <div className="workflow-grid">
            {[
              [
                "01",
                "Make it yours.",
                "Import your plan. Refine every detail. Publish when you’re ready.",
                "#design",
                "Design & publish",
                "design",
              ],
              [
                "02",
                "Make it sell.",
                "Turn available space into bookable stands, with prices on the map.",
                "#sales",
                "Booth sales",
                "sell",
              ],
              [
                "03",
                "Make it easy.",
                "Connect attendees to exhibitors, sessions and their next destination.",
                "#wayfinding",
                "Attendee experience",
                "guide",
              ],
            ].map(([n, title, body, href, link, shape]) => (
              <a className="workflow-card" href={href} key={n}>
                <div className="workflow-top">
                  <span>{n} /</span>
                  <div
                    className={`workflow-symbol symbol-${shape}`}
                    aria-hidden="true"
                  >
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
                <h3>{title}</h3>
                <p>{body}</p>
                <span className="workflow-link">
                  {link}
                  <Arrow diagonal />
                </span>
              </a>
            ))}
          </div>
        </section>

        <section id="design" className="feature-section home-container">
          <div className="feature-copy">
            <Label>01 / DESIGN & PUBLISH</Label>
            <h2>
              Your floor.
              <br />
              Your master plan.
            </h2>
            <p>
              Start with the plan you already have. Turn PDFs and images into
              editable booths, then fine-tune the whole hall in one visual
              workspace.
            </p>
            <ul>
              <Check>Import, draw and arrange booths</Check>
              <Check>Manage multiple halls and levels</Check>
              <Check>Preview each experience before publishing</Check>
            </ul>
            <Link href="/admin/events/new" className="text-link">
              Bring your plan to life <Arrow />
            </Link>
          </div>
          <ProductImage
            name="designer"
            alt="Floor plan editor with booth layout, layers and properties for the selected stand"
            caption="Your plan, down to the last detail"
          />
        </section>

        <section
          id="sales"
          className="feature-section feature-reverse home-container"
        >
          <div className="feature-copy">
            <Label>02 / BOOTH SALES</Label>
            <h2>
              The best spot.
              <br />A simpler booking.
            </h2>
            <p>
              Let exhibitors explore the floor, compare stands and choose where
              they want to be. Availability, dimensions and pricing are right
              there on the map.
            </p>
            <ul>
              <Check>Dedicated booking view for exhibitors</Check>
              <Check>Stand reservations with timed holds</Check>
              <Check>Extras, sponsorships and invoice options</Check>
            </ul>
            <a href={`/e/${DEMO_SLUG}/book`} className="text-link">
              Try the booking experience <Arrow />
            </a>
          </div>
          <ProductImage
            name="booking"
            alt="Real booking map showing an available stand, its price and reservation action"
            caption="A clear path from browsing to booking"
          />
        </section>

        <section id="wayfinding" className="feature-section home-container">
          <div className="feature-copy">
            <Label>03 / ATTENDEE EXPERIENCE</Label>
            <h2>
              Less looking around.
              <br />
              More finding your people.
            </h2>
            <p>
              Make a big venue feel easy to explore. Help attendees discover
              exhibitors, build a personal plan and get from one great
              conversation to the next.
            </p>
            <ul>
              <Check>Search exhibitors, booths and sessions</Check>
              <Check>Save favourites and plan a route</Check>
              <Check>Directions across halls and levels</Check>
            </ul>
            <a href={`/e/${DEMO_SLUG}`} className="text-link">
              Take a look around <Arrow />
            </a>
          </div>
          <ProductImage
            name="attendee"
            alt="Interactive attendee map with exhibitor search, categories and navigation controls"
            caption="Every connection starts somewhere"
          />
        </section>

        <section className="dashboard-section">
          <div className="home-container dashboard-inner">
            <div className="dashboard-copy">
              <Label>THE ORGANISER’S VIEW</Label>
              <h2>
                Keep your finger
                <br />
                on the show floor.
              </h2>
              <p>
                Booth inventory, sales and visitor activity, together in one
                dashboard. See how your event is taking shape and where to focus
                next.
              </p>
              <div className="dashboard-pills">
                <span>Booth availability</span>
                <span>Sales overview</span>
                <span>Visitor analytics</span>
              </div>
              <Link href="/admin" className="text-link">
                Meet your new workspace <Arrow />
              </Link>
            </div>
            <div className="dashboard-image">
              <Image
                src="/images/product/dashboard.png"
                alt="Tessera organiser dashboard showing booth inventory, sales totals and visitor activity using demo data"
                width={1280}
                height={720}
                sizes="(max-width: 900px) 94vw, 780px"
              />
              <p>Actual product · Illustrative demo data</p>
            </div>
          </div>
        </section>

        <section
          id="developers"
          className="home-section home-container integration-section"
        >
          <div>
            <Label>FITS RIGHT IN</Label>
            <h2>
              Your event.
              <br />
              Your ecosystem.
            </h2>
            <p>
              Keep the tools and touchpoints your audience already knows. Add
              your live floor plan to your website or event app, and connect the
              data behind it.
            </p>
            <Link href="/docs" className="text-link">
              Explore the integrations <Arrow />
            </Link>
          </div>
          <div className="integration-grid">
            {[
              [
                "↗",
                "Embed anywhere",
                "A live map on your website, in your event app or on a venue screen.",
                "/docs/embed",
              ],
              [
                "⌘",
                "Built to connect",
                "An API, SDK and webhooks for workflows that go beyond the map.",
                "/docs/api",
              ],
              [
                "⇄",
                "Coming from ExpoFP?",
                "Compatible endpoints and a migration guide to help you make the move.",
                "/docs/migrate",
              ],
              [
                "↓",
                "Your plan. Your data.",
                "Export your floor plan and work with your data on your terms.",
                "/docs/data",
              ],
            ].map(([icon, title, body, href]) => (
              <Link key={title} href={href} className="integration-card">
                <span className="integration-icon" aria-hidden="true">
                  {icon}
                </span>
                <h3>
                  {title}
                  <Arrow diagonal />
                </h3>
                <p>{body}</p>
              </Link>
            ))}
          </div>
        </section>

        <section id="pricing" className="home-container pricing-section">
          <div>
            <Label>LET’S PLAN YOUR NEXT EVENT</Label>
            <h2>
              A small show or
              <br />
              the whole exhibition centre.
            </h2>
            <p>
              Tell us about your venue, booth count and the experience you want
              to create. We’ll talk through the right setup and pricing for your
              event.
            </p>
          </div>
          <div className="pricing-action">
            <a
              href={`mailto:${BRAND.supportEmail}?subject=Let%E2%80%99s%20talk%20about%20Tessera`}
              className="home-button primary-button"
            >
              Talk to the team <Arrow />
            </a>
            <a href={`/e/${DEMO_SLUG}`} className="text-link">
              Explore the product first <Arrow diagonal />
            </a>
          </div>
        </section>

        <section className="home-section home-container faq-section">
          <div>
            <Label>A FEW MORE DETAILS</Label>
            <h2>
              Good questions.
              <br />
              Straight answers.
            </h2>
            <p>
              Still curious?{" "}
              <a href={`mailto:${BRAND.supportEmail}`}>Let’s talk.</a>
            </p>
          </div>
          <div className="faq-list">
            {FAQ.map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <span aria-hidden="true">+</span>
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="closing-section">
          <div className="closing-grid" aria-hidden="true" />
          <div className="home-container">
            <p>EVERY HALL. EVERY BOOTH. EVERY STEP.</p>
            <h2>
              Great events
              <br />
              start with a plan.
            </h2>
            <Link href="/admin/events/new" className="home-button">
              Let’s make yours <Arrow />
            </Link>
            <span className="closing-note">
              Already have a plan? Bring it with you.
            </span>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
