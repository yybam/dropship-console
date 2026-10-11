import { launchPage, delay, humanScroll } from "./browser.js";

export async function scrapeAliExpress(url) {
  const { page, close, dismissCookies } = await launchPage({ proxy: false });
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await dismissCookies();
    await delay(3000, 5000);
    await humanScroll(page, 1);

    const result = await page.evaluate(() => {
      // Method 1: JSON-LD structured data
      const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
      const jsonld = scripts
        .map(s => { try { return JSON.parse(s.textContent); } catch (_) { return null; } })
        .filter(Boolean);
      const product = jsonld.find(d => d["@type"] === "Product");

      if (product?.offers?.price) {
        const img = Array.isArray(product.image)
          ? (product.image[0]?.url ?? product.image[0] ?? null)
          : product.image ?? null;
        return {
          price: parseFloat(product.offers.price),
          inStock: product.offers.availability?.toLowerCase().includes("instock") ?? true,
          title: product.name ?? document.querySelector("h1")?.textContent?.trim() ?? null,
          image: img,
        };
      }

      // Method 2: window data injected by AliExpress
      for (const key of ["__INIT_DATA__", "runParams", "pageOptions"]) {
        const data = window[key];
        const info = data?.data?.productInfoComponent;
        const priceComp = data?.data?.priceComponent;
        if (info) {
          const raw =
            priceComp?.discountPrice?.formattedPrice ??
            priceComp?.originalPrice?.formattedPrice ??
            null;
          return {
            price: raw ? parseFloat(raw.replace(/[^0-9.]/g, "")) : null,
            inStock: true,
            title: info.subject ?? null,
            image: info.mainImageUrl ?? null,
          };
        }
      }

      // Method 3: CSS selectors fallback
      const priceEl = document.querySelector(
        '[class*="product-price-value"],[class*="price--current"],[class*="price--originalText"],.uniform-banner-box-price'
      );
      const titleEl = document.querySelector(
        '[data-pl="product-title"],.product-title-text,[class*="title--wrap"] h1,h1'
      );
      const imgEl = document.querySelector(
        ".magnifier-image[src],.gallery-image[src],[class*=\"slider\"] img[src]"
      );

      let price = null;
      if (priceEl) {
        const digits = priceEl.textContent.replace(/[^0-9.]/g, "");
        price = digits ? parseFloat(digits) : null;
      }

      return {
        price,
        inStock: true,
        title: titleEl?.textContent?.trim() ?? null,
        image: imgEl?.src ?? null,
      };
    });

    if (process.env.SCRAPER_DEBUG === "true") {
      console.log("[AliExpress]", url, result);
    }

    return result;
  } finally {
    await close();
  }
}
