import axios from "axios";
import { launchPage, delay, humanScroll } from "./browser.js";

function extractItemId(url) {
  return url.match(/\/ip\/[^/]*\/(\d+)/)?.[1] ?? url.match(/\/ip\/(\d+)/)?.[1] ?? null;
}

async function viaApi(itemId) {
  const res = await axios.get(`https://api.walmart.com/v3/items/${itemId}?apiKey=${process.env.WALMART_API_KEY}`, { timeout: 12000 });
  const d = res.data;
  return { price: d.salePrice ?? d.msrp ?? null, inStock: !!d.availableOnline, title: d.name ?? null, image: d.imageUrl ?? null };
}

async function viaBrowser(url) {
  const { page, close, dismissCookies } = await launchPage({ proxy: !!process.env.BRIGHTDATA_PROXY });
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 40000 });
    await dismissCookies();
    await delay(1200, 2500);
    await humanScroll(page, 2);
    await page.waitForSelector('[itemprop="price"], [class*="price-characteristic"]', { timeout: 12000 }).catch(() => {});
    return await page.evaluate(() => {
      const priceEl = document.querySelector('[itemprop="price"]') ?? document.querySelector('[class*="price-characteristic"]');
      const priceText = priceEl?.getAttribute("content") ?? priceEl?.textContent ?? "";
      const price = parseFloat(priceText.replace(/[^0-9.]/g, "")) || null;
      const oosText = (document.querySelector('[data-automation-id="add-to-cart-section"]')?.textContent ?? "").toLowerCase();
      const inStock = !oosText.includes("out of stock") && !oosText.includes("unavailable");
      const title = document.querySelector('[itemprop="name"]')?.textContent?.trim() ?? null;
      const image = document.querySelector('[data-testid="hero-image"] img')?.src ?? null;
      return { price, inStock, title, image };
    });
  } finally { await close(); }
}

export async function scrapeWalmart(url) {
  const itemId = extractItemId(url);
  if (itemId && process.env.WALMART_API_KEY) {
    try { return await viaApi(itemId); } catch (e) { console.warn("[Walmart] API failed, using browser:", e.message); }
  }
  return viaBrowser(url);
}
