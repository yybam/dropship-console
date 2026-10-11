import { scrapeAmazon }      from "./amazon.js";
import { scrapeWalmart }     from "./walmart.js";
import { scrapeTarget }      from "./target.js";
import { scrapeEbay }        from "./ebay.js";
import { scrapeAliExpress }  from "./aliexpress.js";

export async function scrape(url, type) {
  if (process.env.SCRAPER_DEBUG === "true") console.log(`[Scrape] ${type} → ${url}`);
  switch (type) {
    case "amazon":     return scrapeAmazon(url);
    case "walmart":    return scrapeWalmart(url);
    case "target":     return scrapeTarget(url);
    case "ebay":       return scrapeEbay(url);
    case "aliexpress": return scrapeAliExpress(url);
    default: throw new Error(`Unknown supplier type: ${type}`);
  }
}
