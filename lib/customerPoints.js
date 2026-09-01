const DEFAULT_WOO_URL = 'https://www.bendemen.com';

function getWooConfig() {
  const url = process.env.WOOCOMMERCE_URL || process.env.NEXT_PUBLIC_WOOCOMMERCE_URL || DEFAULT_WOO_URL;
  const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY || process.env.WOOCOMMERCE_KEY || process.env.NEXT_PUBLIC_WOOCOMMERCE_KEY;
  const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET || process.env.WOOCOMMERCE_SECRET || process.env.NEXT_PUBLIC_WOOCOMMERCE_SECRET;

  if (!consumerKey || !consumerSecret) throw new Error('WooCommerce API sleutels zijn niet geconfigureerd.');
  return { url: url.replace(/\/$/, ''), consumerKey, consumerSecret };
}

function getPointsMeta(customer) {
  const meta = Array.isArray(customer?.meta_data) ? customer.meta_data : [];
  const keys = ['wc_points_balance', '_wc_points_balance', 'points_balance', 'points', 'wc_points'];

  for (const key of keys) {
    const entries = meta.filter((item) => String(item?.key || '') === key);
    for (const entry of entries) {
      const raw = entry?.value;
      const points = typeof raw === 'object' && raw !== null
        ? parseInt(raw.balance ?? raw.points ?? raw.value ?? 0, 10)
        : parseInt(raw, 10);
      if (Number.isFinite(points) && points >= 0) return points;
    }
  }

  const fallbackValues = [customer?.points_balance, customer?.points, customer?.wc_points_balance];
  for (const raw of fallbackValues) {
    const points = parseInt(raw, 10);
    if (Number.isFinite(points) && points >= 0) return points;
  }
  return 0;
}

function buildHeaders(consumerKey, consumerSecret) {
  return {
    Authorization: `Basic ${Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')}`,
    'Content-Type': 'application/json',
    'User-Agent': 'BDM-POS-Server/1.0',
  };
}

async function fetchCustomer(customerId) {
  const { url, consumerKey, consumerSecret } = getWooConfig();
  const response = await fetch(`${url}/wp-json/wc/v3/customers/${encodeURIComponent(customerId)}`, {
    method: 'GET',
    headers: buildHeaders(consumerKey, consumerSecret),
  });
  const text = await response.text();
  let data = {};
  try { data = JSON.parse(text); } catch {}
  if (!response.ok) throw new Error(data?.message || `WooCommerce HTTP ${response.status}`);
  return data;
}

export function extractCustomerPoints(customer) {
  return getPointsMeta(customer);
}

export async function getCustomerPoints(customerId) {
  if (!customerId || Number.isNaN(Number(customerId))) return 0;
  const customer = await fetchCustomer(Number(customerId));
  return getPointsMeta(customer);
}

export async function updateCustomerPoints({ customerId, pointsUsed = 0, totalPaid = 0 }) {
  if (!customerId || Number.isNaN(Number(customerId))) {
    return { updated: false, pointsBalance: 0, reason: 'non-numeric-customer' };
  }

  const numericCustomerId = Number(customerId);
  const used = Math.max(0, parseInt(pointsUsed, 10) || 0);
  const earned = Math.max(0, Math.floor(parseFloat(totalPaid) || 0));
  const { url, consumerKey, consumerSecret } = getWooConfig();
  const customer = await fetchCustomer(numericCustomerId);
  const currentPoints = getPointsMeta(customer);
  const newBalance = Math.max(0, currentPoints - used) + earned;

  const metaData = Array.isArray(customer.meta_data) ? [...customer.meta_data] : [];
  const existingIndex = metaData.findIndex((item) => String(item?.key || '') === 'wc_points_balance');
  const pointsMeta = { key: 'wc_points_balance', value: String(newBalance) };
  if (existingIndex >= 0) metaData[existingIndex] = pointsMeta;
  else metaData.push(pointsMeta);

  const response = await fetch(`${url}/wp-json/wc/v3/customers/${numericCustomerId}`, {
    method: 'PUT',
    headers: buildHeaders(consumerKey, consumerSecret),
    body: JSON.stringify({ meta_data: metaData }),
  });
  const text = await response.text();
  let data = {};
  try { data = JSON.parse(text); } catch {}
  if (!response.ok) throw new Error(data?.message || `WooCommerce HTTP ${response.status}`);
  return { updated: true, pointsBalance: newBalance, customer: data };
}
