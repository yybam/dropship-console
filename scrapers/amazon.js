import { launchPage, delay, humanScroll, moveTo } from "./browser.js";

export async function scrapeAmazon(url) {
  const { page, close, dismissCookies } = await launchPage({ proxy: !!process.env.BRIGHTDATA_PROXY });
  try {
    if (Math.random() < 0.3) {
      await page.goto("https://www.amazon.com", { waitUntil: "domcontentloaded", timeout: 20000 });
      await delay(1200, 2500);
    }
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await dismissCookies();
    await delay(1000, 2200);
    await humanScroll(page, 2);

    if (await page.$("#captchacharacters") || await page.$('form[action*="validateCaptcha"]')) {
      throw new Error("Amazon CAPTCHA triggered — add BRIGHTDATA_PROXY to .env for reliability");
    }

    await page.waitForSelector(".a-price, #price_inside_buybox, #corePrice_feature_div", { timeout: 10000 }).catch(() => {});
    await moveTo(page, ".a-price-whole");

    return await page.evaluate(() => {
      const priceSels = ["#priceblock_ourprice","#priceblock_dealprice","#price_inside_buybox",".a-price .a-offscreen","#corePrice_feature_div .a-price .a-offscreen",".a-price-whole"];
      let priceText = null;
      for (const s of priceSels) { const el = document.querySelector(s); if (el?.textContent?.trim()) { priceText = el.textContent.trim(); break; } }
      const price = priceText ? parseFloat(priceText.replace(/[^0-9.]/g, "")) : null;
      const availText = (document.querySelector("#availability, #outOfStock")?.textContent ?? "").toLowerCase();
      const inStock = !["currently unavailable","out of stock","unavailable"].some(k => availText.includes(k));
      const title = document.querySelector("#productTitle")?.textContent?.trim() ?? null;
      const image = document.querySelector("#landingImage, #imgBlkFront")?.src ?? null;
      return { price, inStock, title, image };
    });
  } finally { await close(); }
}
