import type { Express, Request, Response } from "express";
import { listVenues } from "./db";

const BASE_URL = "https://davaopickpos-jrhmrcab.manus.space";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Dynamic XML sitemap. Beats PickleHub's stale static sitemap: this one is
 * generated from live venue data and refreshed on every request (lightweight,
 * venues rarely change). Includes all customer-facing routes.
 */
export function registerSitemap(app: Express) {
  app.get("/sitemap.xml", async (_req: Request, res: Response) => {
    try {
      const venues = await listVenues();
      const now = new Date().toISOString().slice(0, 10);
      const staticUrls = [
        { path: "/", priority: "1.0", changefreq: "daily" },
        { path: "/courts", priority: "0.9", changefreq: "daily" },
        { path: "/schedule", priority: "0.9", changefreq: "daily" },
        { path: "/book", priority: "0.8", changefreq: "daily" },
        { path: "/my-bookings", priority: "0.5", changefreq: "weekly" },
        { path: "/customer-login", priority: "0.5", changefreq: "weekly" },
      ];
      const venueUrls = (venues ?? []).map((v: { id: number }) => ({
        path: `/schedule?venueId=${v.id}`,
        priority: "0.8",
        changefreq: "daily",
      }));
      const urls = [...staticUrls, ...venueUrls];
      const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
        ...urls.map(u => {
          const loc = u.path.startsWith("/schedule?")
            ? `${BASE_URL}${u.path}`
            : `${BASE_URL}${u.path}`;
          return [
            "  <url>",
            `    <loc>${esc(loc)}</loc>`,
            `    <lastmod>${now}</lastmod>`,
            `    <changefreq>${u.changefreq}</changefreq>`,
            `    <priority>${u.priority}</priority>`,
            "  </url>",
          ].join("\n");
        }),
        "</urlset>",
      ].join("\n");
      res.type("application/xml").send(xml);
    } catch (err) {
      // Serve a minimal sitemap on DB errors rather than 500 (crawler resilience)
      const minimal = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">",
        "  <url><loc>https://davaopickpos-jrhmrcab.manus.space/</loc></url>",
        "</urlset>",
      ].join("\n");
      res.type("application/xml").send(minimal);
    }
  });
}
