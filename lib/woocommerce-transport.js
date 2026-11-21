import https from 'https';

// Only pin a source address when the server actually has that address.
// The old default (45.135.148.12) made every exported copy fail with
// EADDRNOTAVAIL on any machine that does not own that VPS address.
const localAddress = String(process.env.WOOCOMMERCE_LOCAL_ADDRESS || '').trim();
let agent;

export function getWooHttpsAgent() {
  if (!agent) {
    agent = new https.Agent({
      keepAlive: true,
      ...(localAddress ? { localAddress } : {})
    });
  }
  return agent;
}
