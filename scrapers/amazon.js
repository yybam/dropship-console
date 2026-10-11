import axios from "axios";
import { launchPage, delay, humanScroll } from "./browser.js";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "max-age=0",
  "Upgrade-Insecure-Requests": "1",
};

async function fetchParse(url) {
  const { data: html } = await axios.get(url, { headers: HEADERS, timeout: 20000, maxRedirects: 5 });
  if (html.includes("captchacharacters") || html.includes("validateCaptcha")) return null;

  // Method 1: JSON-LD structured data
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const ld = JSON.parse(m[1]);
      const offers = ld?.offers ?? (Array.isArray(ld) ? ld[0]?.offers : null);
      const price = parseFloat(offers?.price ?? offers?.lowPrice ?? "");
      if (price > 0) {
        const avail = (offers?.availability ?? "").toLowerCase();
        return {
          price,
          inStock: !avail.includes("outofstock"),
          title: ld.name?.trim() ?? null,
          image: (Array.isArray(ld.image) ? ld.image[0] : ld.image) ?? null,
        };
      }
    } catch (_) {}
  }

  // Method 2: regex patterns for price in page data
  const priceMatch =
    html.match(/"priceAmount"\s*:\s*([\d.]+)/) ||
    html.match(/class="a-price-whole">\s*(\d[\d,]*)\s*</) ||
    html.match(/"price"\s*:\s*"([\d.]+)"/) ||
    html.match(/\$\s*([\d,]+\.?\d*)/);
  if (!priceMatch) return null;

  const price = parseFloat(priceMatch[1].replace(/,/g, ""));
  const title = html.match(/id="productTitle"[^>]*>\s*([\s\S]*?)\s*<\/span>/)?.[1]?.replace(/\s+/g, " ").trim() ?? null;
  const image = html.match(/id="landingImage"[^>]*src="([^"]+)"/)?.[1] ?? null;
  const availText = (html.match(/id="availability"[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? "").toLowerCase();
  const inStock = !["unavailable", "out of stock"].some(k => availText.includes(k));
  return { price, inStock, title, image };
}

export async function scrapeAmazon(url) {
  // Fast path: lightweight HTTP request — no browser needed, avoids IP blocks
  try {
    const result = await fetchParse(url);
    if (result?.price) return result;
  } catch (_) {}

  // Slow path: headless browser with longer timeout
  const { page, close, dismissCookies } = await launchPage({ proxy: !!process.env.BRIGHTDATA_PROXY });
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await dismissCookies();
    await delay(1000, 2200);
    await humanScroll(page, 2);

    if (await page.$("#captchacharacters") || await page.$('form[action*="validateCaptcha"]')) {
      throw new Error("Amazon CAPTCHA — add BRIGHTDATA_PROXY env var for reliable scraping");
    }

    await page.waitForSelector(".a-price, #price_inside_buybox, #corePrice_feature_div", { timeout: 15000 }).catch(() => {});

    return await page.evaluate(() => {
      const sels = ["#priceblock_ourprice","#priceblock_dealprice","#price_inside_buybox",
                    ".a-price .a-offscreen","#corePrice_feature_div .a-price .a-offscreen",".a-price-whole"];
      let priceText = null;
      for (const s of sels) { const el = document.querySelector(s); if (el?.textContent?.trim()) { priceText = el.textContent.trim(); break; } }
      const price = priceText ? parseFloat(priceText.replace(/[^0-9.]/g, "")) : null;
      const availText = (document.querySelector("#availability,#outOfStock")?.textContent ?? "").toLowerCase();
      const inStock = !["currently unavailable","out of stock","unavailable"].some(k => availText.includes(k));
      const title = document.querySelector("#productTitle")?.textContent?.trim() ?? null;
      const image = document.querySelector("#landingImage,#imgBlkFront")?.src ?? null;
      return { price, inStock, title, image };
    });
  } finally { await close(); }
}
