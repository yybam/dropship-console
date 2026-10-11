import { createClient } from "@libsql/client";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const client = createClient({
  url: process.env.LIBSQL_URL ?? `file:${join(__dirname, "dropship.db")}`,
  authToken: process.env.LIBSQL_AUTH_TOKEN || undefined,
});

// ── Schema ────────────────────────────────────────────────────────────────────

await client.execute(`CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  image TEXT,
  supplier_url TEXT NOT NULL,
  supplier_type TEXT NOT NULL,
  shopify_product_id TEXT,
  last_price REAL,
  last_in_stock INTEGER DEFAULT 1,
  last_synced_at TEXT,
  sync_enabled INTEGER DEFAULT 1,
  my_price REAL,
  niche TEXT DEFAULT 'General',
  notes TEXT,
  auto_reprice INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
)`);

await client.execute(`CREATE TABLE IF NOT EXISTS price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  price REAL,
  in_stock INTEGER,
  recorded_at TEXT DEFAULT (datetime('now'))
)`);

await client.execute(`CREATE TABLE IF NOT EXISTS sync_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  synced_at TEXT DEFAULT (datetime('now')),
  old_price REAL,
  new_price REAL,
  old_in_stock INTEGER,
  new_in_stock INTEGER,
  action TEXT,
  error TEXT
)`);

await client.execute(`CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT DEFAULT 'shopify',
  order_number TEXT UNIQUE,
  customer_name TEXT,
  customer_email TEXT,
  shipping_address TEXT,
  total_price REAL,
  status TEXT DEFAULT 'unfulfilled',
  line_items TEXT,
  notes TEXT,
  fulfilled_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
)`);

await client.execute(`CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
)`);

// Migrations — add new columns to existing tables.
// "duplicate column name" errors are silently ignored (column already exists).
for (const sql of [
  "ALTER TABLE products ADD COLUMN my_price REAL",
  "ALTER TABLE products ADD COLUMN niche TEXT DEFAULT 'General'",
  "ALTER TABLE products ADD COLUMN notes TEXT",
  "ALTER TABLE products ADD COLUMN auto_reprice INTEGER DEFAULT 0",
  "ALTER TABLE orders ADD COLUMN fulfilled_at TEXT",
]) {
  await client.execute(sql).catch(() => {});
}

// Ensure unique index on orders.order_number for upsert to work on existing DBs
await client.execute(
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number)"
).catch(() => {});

// ── Products ─────────────────────────────────────────────────────────────────

export const getProducts = async () => {
  const { rows } = await client.execute(`
    SELECT p.*,
      (SELECT json_group_array(json_object('price', ph.price, 'ts', ph.recorded_at))
       FROM (SELECT price, recorded_at FROM price_history
             WHERE product_id = p.id ORDER BY recorded_at DESC LIMIT 12) ph
      ) as price_history_json
    FROM products p ORDER BY p.created_at DESC
  `);
  return rows;
};

export const getProduct = async (id) => {
  const { rows } = await client.execute({ sql: "SELECT * FROM products WHERE id = ?", args: [id] });
  return rows[0] ?? null;
};

export const addProduct = async (data) => {
  const result = await client.execute({
    sql: `INSERT INTO products (title, image, supplier_url, supplier_type, shopify_product_id, my_price, niche, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [data.title, data.image, data.supplier_url, data.supplier_type,
           data.shopify_product_id, data.my_price, data.niche, data.notes],
  });
  return { lastInsertRowid: Number(result.lastInsertRowid) };
};

export const updateProduct = async (id, { my_price, niche, notes }) => {
  await client.execute({
    sql: `UPDATE products SET
            my_price = COALESCE(?, my_price),
            niche    = COALESCE(?, niche),
            notes    = ?
          WHERE id = ?`,
    args: [my_price ?? null, niche ?? null, notes ?? null, id],
  });
};

export const setMyPrice = async (id, price) => {
  await client.execute({ sql: "UPDATE products SET my_price = ? WHERE id = ?", args: [price, id] });
};

export const setAutoReprice = async (id, enabled) => {
  await client.execute({ sql: "UPDATE products SET auto_reprice = ? WHERE id = ?", args: [enabled ? 1 : 0, id] });
};

export const updateProductSync = async (id, { price, inStock, title, image }) => {
  await client.execute({
    sql: `UPDATE products SET
            last_price      = ?,
            last_in_stock   = ?,
            last_synced_at  = datetime('now'),
            title           = COALESCE(?, title),
            image           = COALESCE(?, image)
          WHERE id = ?`,
    args: [price, inStock ? 1 : 0, title ?? null, image ?? null, id],
  });

  if (price != null) {
    await client.execute({
      sql: "INSERT INTO price_history (product_id, price, in_stock) VALUES (?, ?, ?)",
      args: [id, price, inStock ? 1 : 0],
    });
    // Keep only the last 90 data points per product
    await client.execute({
      sql: `DELETE FROM price_history WHERE product_id = ? AND id NOT IN (
              SELECT id FROM price_history WHERE product_id = ? ORDER BY recorded_at DESC LIMIT 90
            )`,
      args: [id, id],
    });
  }
};

export const toggleProduct = async (id) =>
  client.execute({ sql: "UPDATE products SET sync_enabled = 1 - sync_enabled WHERE id = ?", args: [id] });

export const deleteProduct = async (id) =>
  client.execute({ sql: "DELETE FROM products WHERE id = ?", args: [id] });

export const getEnabledProducts = async () => {
  const { rows } = await client.execute("SELECT * FROM products WHERE sync_enabled = 1");
  return rows;
};

export const getPriceHistory = async (id, limit = 30) => {
  const { rows } = await client.execute({
    sql: "SELECT price, in_stock, recorded_at FROM price_history WHERE product_id = ? ORDER BY recorded_at ASC LIMIT ?",
    args: [id, limit],
  });
  return rows;
};

// ── Logs ─────────────────────────────────────────────────────────────────────

export const addLog = async (data) => {
  await client.execute({
    sql: `INSERT INTO sync_logs (product_id, old_price, new_price, old_in_stock, new_in_stock, action, error)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [data.product_id, data.old_price ?? null, data.new_price ?? null,
           data.old_in_stock ?? null, data.new_in_stock ?? null, data.action, data.error ?? null],
  });
};

export const getLogs = async (limit = 50) => {
  const { rows } = await client.execute({
    sql: `SELECT l.*, p.title as product_title, p.supplier_type
          FROM sync_logs l LEFT JOIN products p ON l.product_id = p.id
          ORDER BY l.synced_at DESC LIMIT ?`,
    args: [limit],
  });
  return rows;
};

// ── Orders ────────────────────────────────────────────────────────────────────

export const getOrders = async (limit = 100) => {
  const { rows } = await client.execute({ sql: "SELECT * FROM orders ORDER BY created_at DESC LIMIT ?", args: [limit] });
  return rows;
};

export const upsertOrder = async (data) => {
  await client.execute({
    sql: `INSERT INTO orders (order_number, customer_name, customer_email, shipping_address, total_price, status, line_items, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(order_number) DO UPDATE SET status = excluded.status`,
    args: [data.order_number, data.customer_name, data.customer_email, data.shipping_address,
           data.total_price, data.status, data.line_items, data.notes, data.created_at],
  });
};

export const fulfillOrder = async (id) =>
  client.execute({ sql: "UPDATE orders SET status = 'fulfilled', fulfilled_at = datetime('now') WHERE id = ?", args: [id] });

// ── Settings ──────────────────────────────────────────────────────────────────

export const getSetting = async (key, fallback = null) => {
  const { rows } = await client.execute({ sql: "SELECT value FROM settings WHERE key = ?", args: [key] });
  return rows[0]?.value ?? fallback;
};

export const setSetting = async (key, value) =>
  client.execute({ sql: "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", args: [key, String(value)] });

// ── Stats ─────────────────────────────────────────────────────────────────────

export const getStats = async () => {
  const [r1, r2, r3, r4, r5, r6, r7, r8] = await Promise.all([
    client.execute("SELECT COUNT(*) as n FROM products"),
    client.execute("SELECT COUNT(*) as n FROM products WHERE last_in_stock = 0"),
    client.execute("SELECT COUNT(*) as n FROM orders"),
    client.execute("SELECT COUNT(*) as n FROM orders WHERE status != 'fulfilled'"),
    client.execute(`SELECT COUNT(*) as n FROM sync_logs
                    WHERE action IN ('price_alert_sent','inventory_zeroed')
                    AND synced_at >= datetime('now', '-1 day')`),
    client.execute(`SELECT COALESCE(SUM(my_price - last_price), 0) as potential
                    FROM products WHERE my_price IS NOT NULL AND last_price IS NOT NULL AND last_in_stock = 1`),
    client.execute(`SELECT COALESCE(AVG((my_price - last_price) * 100.0 / my_price), 0) as avg_margin
                    FROM products WHERE my_price > 0 AND last_price IS NOT NULL`),
    client.execute(`SELECT niche, COUNT(*) as count,
                      SUM(CASE WHEN last_in_stock = 0 THEN 1 ELSE 0 END) as oos_count
                    FROM products GROUP BY niche ORDER BY count DESC`),
  ]);

  return {
    total:           Number(r1.rows[0].n),
    oos:             Number(r2.rows[0].n),
    orders:          Number(r3.rows[0].n),
    unfulfilled:     Number(r4.rows[0].n),
    alerts24h:       Number(r5.rows[0].n),
    profitPotential: Math.round((r6.rows[0]?.potential ?? 0) * 100) / 100,
    avgMargin:       Math.round((r7.rows[0]?.avg_margin ?? 0) * 10) / 10,
    niches:          r8.rows,
  };
};

export default client;
