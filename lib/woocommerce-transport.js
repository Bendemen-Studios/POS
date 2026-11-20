import https from 'https';

// Dedicated source IP for WooCommerce HTTPS traffic only.
const localAddress = process.env.WOOCOMMERCE_LOCAL_ADDRESS || '45.135.148.12';
let agent;
export function getWooHttpsAgent() {
  if (!agent) agent = new https.Agent({ keepAlive: true, localAddress });
  return agent;
}
