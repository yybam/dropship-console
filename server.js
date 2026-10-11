import "dotenv/config";
import express from "express";
import cron from "node-cron";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  getProducts, addProduct, updateProduct, deleteProduct, toggleProduct,
  getLogs, getOrders, upsertOrder, fulfillOrder,
  getStats, getSetting, setSetting, getProduct, getPriceHistory,
  setAutoReprice,
} from "./database.js";
import { syncAll, syncProduct, syncRunning, lastSyncAt } from "./sync.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, "public")));

// ── Products ──────────────────────────────────────────────────────────────────

app.get("/api/products", async (req, res) => {
  const { niche, supplier, status } = req.query;
  let products = await getProducts();
  if (niche && niche !== "all")       products = products.filter(p => p.niche === niche);
  if (supplier && supplier !== "all") products = products.filter(p => p.supplier_type === supplier);
  if (status === "oos")               products = products.filter(p => p.last_in_stock === 0);
  if (status === "active")            products = products.filter(p => p.sync_enabled === 1);
  res.json(products);
});

app.post("/api/products/import", async (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows)) return res.status(400).json({ error: "rows array required" });
  let added = 0, skipped = 0;
  const errors = [];
  for (const row of rows) {
    if (!row.url || !row.type) { skipped++; continue; }
    try {
      await addProduct({
        title: null, image: null,
        supplier_url: row.url,
        supplier_type: row.type.toLowerCase(),
        shopify_product_id: null,
        my_price: row.my_price ? parseFloat(row.my_price) : null,
        niche: row.niche || "General",
        notes: null,
      });
      added++;
    } catch (e) {
      errors.push(`${row.url}: ${e.message}`);
    }
  }
  res.json({ added, skipped, errors });
});

app.post("/api/products", async (req, res) => {
  const { supplier_url, supplier_type, shopify_product_id, my_price, niche, notes } = req.body;
  if (!supplier_url || !supplier_type)
    return res.status(400).json({ error: "supplier_url and supplier_type required" });
  const result = await addProduct({
    title: null, image: null,
    supplier_url, supplier_type,
    shopify_product_id: shopify_product_id || null,
    my_price: my_price ? parseFloat(my_price) : null,
    niche: niche || "General",
    notes: notes || null,
  });
  res.json({ id: result.lastInsertRowid, supplier_url, supplier_type });
});

app.put("/api/products/:id", async (req, res) => {
  const { my_price, niche, notes } = req.body;
  await updateProduct(parseInt(req.params.id), {
    my_price: my_price != null ? parseFloat(my_price) : null,
    niche: niche || null,
    notes: notes ?? null,
  });
  res.json({ ok: true });
});

app.delete("/api/products/:id", async (req, res) => {
  await deleteProduct(parseInt(req.params.id));
  res.json({ ok: true });
});

app.post("/api/products/:id/toggle", async (req, res) => {
  await toggleProduct(parseInt(req.params.id));
  res.json({ ok: true });
});

app.post("/api/products/:id/auto-reprice", async (req, res) => {
  const { enabled } = req.body;
  await setAutoReprice(parseInt(req.params.id), enabled ? 1 : 0);
  res.json({ ok: true });
});

app.get("/api/products/:id/history", async (req, res) => {
  res.json(await getPriceHistory(parseInt(req.params.id), 60));
});

// ── Sync ──────────────────────────────────────────────────────────────────────

app.post("/api/sync", async (req, res) => {
  const { product_id } = req.body;
  if (product_id) {
    const p = await getProduct(parseInt(product_id));
    if (!p) return res.status(404).json({ error: "Product not found" });
    res.json({ ok: true, message: "Sync started" });
    syncProduct(p).catch(console.error);
  } else {
    if (syncRunning) return res.json({ ok: false, message: "Sync already running" });
    res.json({ ok: true, message: "Full sync started" });
    syncAll().catch(console.error);
  }
});

app.get("/api/sync/status", (req, res) => {
  res.json({ running: syncRunning, lastSyncAt });
});

// ── Logs ──────────────────────────────────────────────────────────────────────

app.get("/api/logs", async (req, res) => res.json(await getLogs(100)));

// ── Orders ────────────────────────────────────────────────────────────────────

app.get("/api/orders", async (req, res) => res.json(await getOrders(100)));

app.post("/api/orders/:id/fulfill", async (req, res) => {
  await fulfillOrder(parseInt(req.params.id));
  res.json({ ok: true });
});

app.post("/api/webhooks/orders", async (req, res) => {
  try {
    const order = req.body;
    const products = await getProducts();
    const lineItems = (order.line_items || []).map(item => {
      const tracked = products.find(p => p.shopify_product_id === String(item.product_id));
      return {
        title: item.title, quantity: item.quantity,
        price: item.price, sku: item.sku,
        supplier_url: tracked?.supplier_url || null,
        supplier_type: tracked?.supplier_type || null,
      };
    });
    await upsertOrder({
      order_number: order.name,
      customer_name: order.customer
        ? `${order.customer.first_name} ${order.customer.last_name}`.trim()
        : "Guest",
      customer_email: order.customer?.email || null,
      shipping_address: JSON.stringify(order.shipping_address || {}),
      total_price: parseFloat(order.total_price || 0),
      status: order.fulfillment_status || "unfulfilled",
      line_items: JSON.stringify(lineItems),
      notes: order.note || null,
      created_at: order.created_at || new Date().toISOString(),
    });
    res.sendStatus(200);
  } catch (e) { console.error("[Webhook]", e.message); res.sendStatus(500); }
});

// ── Stats ─────────────────────────────────────────────────────────────────────

app.get("/api/stats", async (req, res) => {
  res.json({ ...(await getStats()), syncRunning, lastSyncAt });
});

// ── Settings ──────────────────────────────────────────────────────────────────

app.get("/api/settings", async (req, res) => res.json({
  alertEmail:    await getSetting("alertEmail",    process.env.ALERT_EMAIL || ""),
  syncInterval:  await getSetting("syncInterval",  process.env.SYNC_INTERVAL_MINUTES || "120"),
  priceAlertPct: await getSetting("priceAlertPct", "0.5"),
  defaultMarkup: await getSetting("defaultMarkup", "2.5"),
}));

app.post("/api/settings", async (req, res) => {
  const { alertEmail, syncInterval, priceAlertPct, defaultMarkup } = req.body;
  if (alertEmail !== undefined)    await setSetting("alertEmail",    alertEmail);
  if (syncInterval !== undefined)  await setSetting("syncInterval",  syncInterval);
  if (priceAlertPct !== undefined) await setSetting("priceAlertPct", priceAlertPct);
  if (defaultMarkup !== undefined) await setSetting("defaultMarkup", defaultMarkup);
  res.json({ ok: true });
});

// ── Cron ──────────────────────────────────────────────────────────────────────

const intervalMins = parseInt(process.env.SYNC_INTERVAL_MINUTES || "120");
const cronExpr = intervalMins >= 60
  ? `0 */${Math.floor(intervalMins / 60)} * * *`
  : `*/${intervalMins} * * * *`;

cron.schedule(cronExpr, () => {
  console.log("[Cron] Auto-sync triggered");
  syncAll().catch(console.error);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✅ Dropship Dashboard running at http://localhost:${PORT}\n`);
  console.log(`   Auto-sync every ${intervalMins} minutes`);
  console.log(`   Alert email: ${process.env.ALERT_EMAIL || "(not set)"}\n`);
  if (process.env.LIBSQL_URL && !process.env.LIBSQL_URL.startsWith("file:")) {
    console.log(`   Database: Turso cloud (${process.env.LIBSQL_URL})\n`);
  } else {
    console.log(`   Database: local SQLite\n`);
  }
});
