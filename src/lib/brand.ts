/**
 * Single source of truth for product branding. Renaming the product means editing this file only.
 */
export const BRAND = {
  name: "Tessera",
  tagline: "Every hall, every booth, every step.",
  description:
    "Interactive floor plans, booth sales and wayfinding for events. Built by Grip.",
  company: "Grip",
  sdkGlobal: "Tessera", // window.Tessera in the embed SDK
  apiKeyPrefix: "tsr", // tsr_live_xxx
  cookiePrefix: "tsr",
  supportEmail: "support@grip.events",
} as const;
