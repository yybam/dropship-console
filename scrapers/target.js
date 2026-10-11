import { launchPage, delay, humanScroll, moveTo } from "./browser.js";

export async function scrapeTarget(url) {
  const { page, close, dismissCookies } = await launchPage({ proxy: !!process.env.BRIGHTDATA_PROXY });
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
    await dismissCookies();
    await delay(1500, 3000);
    await humanScroll(page, 3);

    const title = await page.title();
    if (title.toLowerCase().includes("access denied") || title.toLowerCase().includes("datadome")) {
      throw new Error("Target bot protection triggered — add BRIGHTDATA_PROXY to .env");
    }

    await page.waitForSelector('[data-test="product-price"], [class*="CurrentPriceFontSize"]', { timeout: 15000 }).catch(() => {});
    await moveTo(page, '[data-test="product-price"]');

    return await page.evaluate(() => {
      const priceEl = document.querySelector('[data-test="product-price"]') ?? document.querySelector('[class*="CurrentPriceFontSize"]');
      const price = parseFloat((priceEl?.textContent ?? "").replace(/[^0-9.]/g, "")) || null;
      const oosText = (document.querySelector('[data-test="availability-status"]')?.textContent ?? "").toLowerCase();
      const btnText = (document.querySelector('[data-test="orderButtons"] button')?.textContent ?? "").toLowerCase();
      const inStock = !oosText.includes("out of stock") && !btnText.includes("out of stock") && !btnText.includes("see similar");
      const title = document.querySelector('[data-test="product-title"], h1')?.textContent?.trim() ?? null;
      const image = document.querySelector('[data-test="product-image"] img, .slide-image img')?.src ?? null;
      return { price, inStock, title, image };
    });
  } finally { await close(); }
}
