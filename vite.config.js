import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

// Inject the current round/opponent from src/data.json into the OG meta tags at build time
// so WhatsApp link previews always show the right matchup. Falls back to a generic title if
// data.json hasn't been generated yet.
function injectOg() {
  return {
    name: "inject-og-tags",
    transformIndexHtml(html) {
      const siteUrl = process.env.SITE_URL || "https://doggies.up.railway.app";
      let round, opponent;
      try {
        const data = JSON.parse(readFileSync(new URL("./src/data.json", import.meta.url), "utf8"));
        round = data.match?.round;
        opponent = data.match?.opponent;
      } catch { /* no data.json yet — use fallback below */ }

      const title = round && opponent ? `🐶 Dog Yard — Rd ${round} v ${opponent}` : "🐶 Dog Yard — for the Parkyard boys";
      const description = round && opponent
        ? `Round ${round} v ${opponent}. Tip the result, debate the coaching calls, read the washup. Tony · Benny · Jordy.`
        : "Tip the result, debate the coaching calls, read the washup. Tony · Benny · Jordy.";

      return html
        .replaceAll("{{ogTitle}}", title)
        .replaceAll("{{ogDescription}}", description)
        .replaceAll("{{siteUrl}}", siteUrl);
    },
  };
}

export default defineConfig({
  plugins: [react(), injectOg()],
  server: { host: true, port: 5180, strictPort: true },
});
