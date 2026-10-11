import { scrape } from "./scrapers/index.js";
import { getEnabledProducts, updateProductSync, addLog, getProduct, setMyPrice } from "./database.js";
import { sendPriceAlert, sendOosAlert, sendRestockAlert } from "./email.js";

export let syncRunning = false;
export let lastSyncAt = null;

export async function syncProduct(product) {
  let result;
  try {
    result = await scrape(product.supplier_url, product.supplier_type);
  } catch (err) {
    console.error(`[Sync] ✗ Failed "${product.title || product.supplier_url}":`, err.message);
    await addLog({
      product_id: product.id,
      old_price: product.last_price, new_price: null,
      old_in_stock: product.last_in_stock, new_in_stock: null,
      action: "error", error: err.message,
    });
    return;
  }

  const { price, inStock, title, image } = result;
  const wasInStock = product.last_in_stock === 1;
  let action = "no_change";

  // OOS detection
  if (wasInStock && !inStock) {
    action = "inventory_zeroed";
    await sendOosAlert({ title: title || product.title, url: product.supplier_url });
    console.log(`[Sync] ✗ OOS: "${title || product.title}"`);
  }

  // Restock detection
  if (!wasInStock && inStock) {
    action = "back_in_stock";
    await sendRestockAlert({ title: title || product.title, url: product.supplier_url });
    console.log(`[Sync] ✓ Back in stock: "${title || product.title}"`);
  }

  // Price change handling
  if (price != null && product.last_price != null) {
    const pctChange = (price - product.last_price) / product.last_price;

    if (Math.abs(pctChange) > 0.005) { // > 0.5% change
      if (pctChange > 0) {
        // Price went UP — send alert
        action = action === "no_change" ? "price_alert_sent" : action;
        await sendPriceAlert({
          title: title || product.title,
          url: product.supplier_url,
          oldPrice: product.last_price,
          newPrice: price,
        });
        console.log(`[Sync] ↑ Price up: "${title || product.title}" $${product.last_price} → $${price}`);
      } else {
        // Price went DOWN — log it
        console.log(`[Sync] ↓ Price down: "${title || product.title}" $${product.last_price} → $${price}`);
      }

      // Auto-reprice: maintain the same markup ratio when price changes
      if (product.auto_reprice && product.my_price && product.last_price) {
        const markupRatio = product.my_price / product.last_price;
        const newMyPrice = Math.round(price * markupRatio * 100) / 100;
        await setMyPrice(product.id, newMyPrice);
        console.log(`[Sync] 💰 Auto-repriced "${title || product.title}": $${product.my_price} → $${newMyPrice}`);
      }
    }
  }

  await updateProductSync(product.id, { price, inStock, title, image });
  await addLog({
    product_id: product.id,
    old_price: product.last_price, new_price: price,
    old_in_stock: product.last_in_stock, new_in_stock: inStock ? 1 : 0,
    action, error: null,
  });
}

export async function syncAll() {
  if (syncRunning) { console.log("[Sync] Already running, skipping"); return; }
  syncRunning = true;
  const products = await getEnabledProducts();
  console.log(`[Sync] Starting — ${products.length} products`);
  for (const p of products) {
    await syncProduct(p);
    await new Promise(r => setTimeout(r, 3000 + Math.random() * 4000));
  }
  lastSyncAt = new Date().toISOString();
  syncRunning = false;
  console.log("[Sync] Complete");
}
