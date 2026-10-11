import { launchPage, delay } from "./browser.js";

function extractItemId(url) {
  return (
    url.match(/\/itm\/(?:[^/?]+\/)?(\d{8,13})/)?.[1] ??
    url.match(/[?&]item=(\d{8,13})/)?.[1] ??
    null
  );
}

export async function scrapeEbay(url) {
  const { page, close, dismissCookies } = await launchPage({ proxy: false });
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await dismissCookies();
    await delay(2000, 3500);

    const result = await page.evaluate(() => {
      // eBay embeds JSON-LD structured data — the most reliable price source
      const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
      const jsonld = scripts
        .map(s => { try { return JSON.parse(s.textContent); } catch(_){ return null; } })
        .filter(Boolean);

      // Find the Product schema object
      const product = jsonld.find(d => d["@type"] === "Product");
      const offer = product?.offers;

      const price = offer?.price ? parseFloat(offer.price) : null;
      const inStock = offer?.availability
        ? offer.availability.toLowerCase().includes("instock")
        : null;
      const title = product?.name ?? document.querySelector("h1")?.textContent?.trim() ?? null;
      const image = Array.isArray(product?.image)
        ? product.image[0]?.url ?? null
        : product?.image ?? null;

      // Fallback: scan for first dollar amount if JSON-LD has no price
      let fallbackPrice = null;
      if (!price) {
        document.querySelectorAll("span, div").forEach(el => {
          if (!fallbackPrice && el.children.length === 0) {
            const t = el.textContent.trim();
            if (/^\$[\d,]+\.\d{2}$/.test(t)) fallbackPrice = parseFloat(t.replace(/[^0-9.]/g, ""));
          }
        });
      }

      return { price: price ?? fallbackPrice, inStock: inStock ?? true, title, image };
    });

    if (process.env.SCRAPER_DEBUG === "true") {
      console.log("[eBay]", url, result);
    }

    return result;
  } finally {
    await close();
  }
}
