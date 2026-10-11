import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const to = () => process.env.ALERT_EMAIL || "you@example.com";

async function send(subject, html) {
  if (!resend) { console.log(`[Email] No RESEND_API_KEY — would send: ${subject}`); return; }
  try {
    await resend.emails.send({ from: "Dropship Sync <alerts@dropshipsync.app>", to: to(), subject, html });
  } catch (e) { console.error("[Email] Send failed:", e.message); }
}

export const sendPriceAlert = ({ title, url, oldPrice, newPrice }) =>
  send(`[Dropship] Price Increase: ${title}`, `
    <h2 style="color:#e53e3e">Price Increase — Manual Review Needed</h2>
    <p><b>${title}</b></p>
    <p>Old: <b style="color:green">$${oldPrice.toFixed(2)}</b> → New: <b style="color:red">$${newPrice.toFixed(2)}</b> (+${(((newPrice-oldPrice)/oldPrice)*100).toFixed(1)}%)</p>
    <p><a href="${url}">View on supplier site</a></p>
    <p>Shopify price was NOT changed. Please review your listing.</p>
  `);

export const sendOosAlert = ({ title, url }) =>
  send(`[Dropship] Out of Stock: ${title}`, `
    <h2 style="color:#e53e3e">Item Out of Stock</h2>
    <p><b>${title}</b> is out of stock at the supplier.</p>
    <p><a href="${url}">View supplier listing</a></p>
  `);

export const sendRestockAlert = ({ title, url }) =>
  send(`[Dropship] Back In Stock: ${title}`, `
    <h2 style="color:#38a169">Item Back In Stock</h2>
    <p><b>${title}</b> is available again.</p>
    <p><a href="${url}">View supplier listing</a></p>
  `);
