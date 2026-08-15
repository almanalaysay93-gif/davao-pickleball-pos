/**
 * Per-route SEO meta manager.
 *
 * PickleHub.ph ships one hardcoded <title>/OG set for every route. We update
 * document.title + meta description per route so each page is properly
 * identifiable to browsers, social shares, and search crawlers (the site is
 * client-rendered, so dynamic titles are the strongest signal we can ship
 * without SSR; crawlers that execute JS will see the real titles).
 *
 * Stack-based: set on mount, restore on unmount — safe for nested components.
 */
import { useEffect } from "react";

const SITE_NAME = "Davao Pickleball POS";
const DEFAULT_TITLE = `Davao Pickleball POS — Book a Court in Minutes | Every Court in Davao`;
const DEFAULT_DESCRIPTION =
  "Real-time availability, booking, and checkout for every pickleball court in Davao City. Browse 8 venues, see live hourly slots, and reserve your court in minutes.";

export interface JsonLdItem {
  "@type": string;
  name: string;
  address?: { "@type": string; streetAddress: string; addressLocality: string; addressCountry: string };
  telephone?: string | null;
  url?: string;
  image?: string | null;
  description?: string;
  priceRange?: string;
  geo?: { "@type": string; latitude: number; longitude: number };
}

const titleStack: string[] = [];
const jsonLdStack: JsonLdItem[] = [];
const descriptionStack: string[] = [];

function syncMeta() {
  document.title = titleStack.length ? titleStack[titleStack.length - 1] : DEFAULT_TITLE;
  const desc = descriptionStack.length
    ? descriptionStack[descriptionStack.length - 1]
    : DEFAULT_DESCRIPTION;
  let el = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", "description");
    document.head.appendChild(el);
  }
  el.setAttribute("content", desc);

  // JSON-LD block (LocalBusiness items for venue directory pages)
  document.head
    .querySelectorAll('script[type="application/ld+json"]')
    .forEach(n => n.remove());
  if (jsonLdStack.length) {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Pickleball Courts in Davao City",
      itemListElement: jsonLdStack.map((it, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: { "@context": "https://schema.org", ...it },
      })),
    });
    document.head.appendChild(script);
  }
}

export function usePageMeta(opts: { title: string; description?: string; venues?: JsonLdItem[] }) {
  useEffect(() => {
    titleStack.push(opts.title);
    descriptionStack.push(opts.description ?? DEFAULT_DESCRIPTION);
    jsonLdStack.push(...(opts.venues ?? []));
    syncMeta();
    return () => {
      titleStack.pop();
      descriptionStack.pop();
      jsonLdStack.splice(0, opts.venues?.length ?? 0);
      syncMeta();
    };
  }, [opts.title, opts.description, opts.venues?.length]);
}

export { DEFAULT_TITLE, DEFAULT_DESCRIPTION, SITE_NAME };
