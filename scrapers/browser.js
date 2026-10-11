import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

// On Render.com the build installs browsers into the project dir, not ~/.cache
if (process.env.RENDER) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = "/opt/render/project/src";
}

chromium.use(StealthPlugin());

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.6613.120 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
];

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const delay = (min = 800, max = 2500) =>
  new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));

export const humanScroll = async (page, passes = 2) => {
  for (let i = 0; i < passes; i++) {
    await page.evaluate(() => window.scrollBy(0, 150 + Math.random() * 350));
    await delay(300, 800);
  }
};

export const moveTo = async (page, selector) => {
  try {
    const el = await page.$(selector);
    if (!el) return;
    const box = await el.boundingBox();
    if (!box) return;
    await page.mouse.move(
      box.x + box.width * (0.3 + Math.random() * 0.4),
      box.y + box.height * (0.3 + Math.random() * 0.4),
      { steps: 10 + Math.floor(Math.random() * 15) }
    );
    await delay(100, 300);
  } catch (_) {}
};

async function dismissCookies(page) {
  for (const sel of [
    "#onetrust-accept-btn-handler",
    'button[id*="accept-all"]',
    'button[class*="accept"]',
    '[data-testid*="accept"]',
  ]) {
    try {
      const btn = await page.$(sel);
      if (btn) { await btn.click(); await delay(400, 800); return; }
    } catch (_) {}
  }
}

export async function launchPage({ proxy = false } = {}) {
  const ua = pick(USER_AGENTS);
  const vp = pick(VIEWPORTS);

  const opts = {
    headless: true,
    args: [
      "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
      "--disable-gpu", "--disable-extensions",
      "--disable-background-networking", "--disable-default-apps",
      "--disable-sync", "--no-first-run",
      "--disable-accelerated-2d-canvas", "--disable-accelerated-video-decode",
      `--window-size=${vp.width},${vp.height}`,
    ],
  };

  if (proxy && process.env.BRIGHTDATA_PROXY) {
    const [host, port, user, pass] = process.env.BRIGHTDATA_PROXY.split(":");
    opts.proxy = { server: `http://${host}:${port}`, username: user, password: pass };
  }

  const browser = await chromium.launch(opts);
  const ctx = await browser.newContext({
    userAgent: ua, viewport: vp, locale: "en-US", timezoneId: "America/New_York",
    extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
  });

  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
  });

  const page = await ctx.newPage();
  const close = async () => { try { await browser.close(); } catch (_) {} };
  return { page, close, dismissCookies: () => dismissCookies(page) };
}
