import axios from 'axios';
import { bdmposQueueAxiosAdapter } from './bdmpos-core-queue';
import { getWooHttpsAgent } from './woocommerce-transport';

// The shop server cannot call bendemen.com. WordPress polls the POS and the
// plugin worker creates the order. Direct HTTPS is opt-in for a machine that
// can reach the shop itself.
function coreQueueEnabled() {
  return String(process.env.BDMPOS_CORE_TRANSPORT || 'queue').trim().toLowerCase() !== 'direct';
}

function coreTransport() {
  return {
    httpsAgent: getWooHttpsAgent(),
    ...(coreQueueEnabled() ? { adapter: bdmposQueueAxiosAdapter } : {})
  };
}

const PAGE_SIZE = 100;

function getCoreBaseUrl() {
  const configured = String(process.env.BDMPOS_CORE_URL || '').trim().replace(/\/+$/, '');
  if (!configured) return '';
  if (/\/wp-json\/bdmpos\/v1$/i.test(configured)) return configured;
  if (/\/wp-json$/i.test(configured)) return configured + '/bdmpos/v1';
  return configured + '/wp-json/bdmpos/v1';
}

/**
 * Fetch the WooCommerce catalog through the authenticated BDM POS Core bridge.
 * This module is server-only: the secret is read from process.env and must
 * never be exposed to browser code.
 */
export async function fetchBdmposCatalog() {
  const baseUrl = getCoreBaseUrl();
  const secret = process.env.BDMPOS_CORE_SECRET;
  if (!baseUrl || !secret) throw new Error('BDM POS Core URL or secret is not configured');

  const client = axios.create({
    baseURL: baseUrl,
    timeout: 40000,
    ...coreTransport(),
    headers: {
      'X-BDM-POS-Secret': secret,
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
      'User-Agent': 'BDM-POS-Server/1.0'
    }
  });

  const products = [];
  for (let page = 1; page <= 10000; page += 1) {
    const { data } = await client.get('/catalog', {
      params: { page, per_page: PAGE_SIZE }
    });
    if (!data?.success || !Array.isArray(data.products)) {
      throw new Error('BDM POS Core returned an invalid catalog response');
    }
    products.push(...data.products);
    if (!data.has_more || data.products.length === 0) break;
    if (page === 10000) throw new Error('BDM POS Core catalog exceeded the safety page limit');
  }

  const { data: categoryResponse } = await client.get('/categories');
  if (!categoryResponse?.success || !Array.isArray(categoryResponse.categories)) {
    throw new Error('BDM POS Core returned an invalid categories response');
  }

  return {
    products,
    categories: categoryResponse.categories.map(category => ({
      id: Number(category.id),
      name: category.name,
      slug: category.slug || '',
      parent: Number(category.parent || 0)
    }))
  };
}

/** Fetch the complete customer directory through the read-only Core endpoint. */
export async function fetchBdmposCustomers() {
  const baseUrl = getCoreBaseUrl();
  const secret = process.env.BDMPOS_CORE_SECRET;
  if (!baseUrl || !secret) throw new Error('BDM POS Core URL or secret is not configured');

  const client = axios.create({
    baseURL: baseUrl,
    timeout: 40000,
    ...coreTransport(),
    headers: {
      'X-BDM-POS-Secret': secret,
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
      'User-Agent': 'BDM-POS-Server/1.0'
    }
  });

  const customers = [];
  let total = 0;
  for (let page = 1; page <= 10000; page += 1) {
    const { data } = await client.get('/customers', {
      params: { page, per_page: PAGE_SIZE }
    });
    if (!data?.success || !Array.isArray(data.customers)) {
      throw new Error('BDM POS Core returned an invalid customers response');
    }
    customers.push(...data.customers);
    total = Number(data.total || customers.length);
    if (page >= Number(data.total_pages || 1) || data.customers.length === 0) break;
    if (page === 10000) throw new Error('BDM POS Core customer directory exceeded the safety page limit');
  }
  return { customers, total };
}

/** Read a single customer's points balance. This helper has no write operation. */
export async function fetchBdmposCustomerPoints(customerId) {
  const baseUrl = getCoreBaseUrl();
  const secret = process.env.BDMPOS_CORE_SECRET;
  if (!baseUrl || !secret) throw new Error('BDM POS Core URL or secret is not configured');
  const response = await axios.get(
    `${baseUrl}/customers/${encodeURIComponent(String(customerId))}/points`,
    {
      timeout: 20000,
      ...coreTransport(),
      headers: {
        'X-BDM-POS-Secret': secret,
        Accept: 'application/json',
        'User-Agent': 'BDM-POS-Server/1.0'
      }
    }
  );
  if (!response.data?.success) throw new Error('BDM POS Core returned an invalid points response');
  return Math.max(0, Number(response.data.points_balance) || 0);
}


/** Fetch a paginated read-only stock snapshot, including variable-product children. */
export async function fetchBdmposStock() {
  const baseUrl = getCoreBaseUrl();
  const secret = process.env.BDMPOS_CORE_SECRET;
  if (!baseUrl || !secret) throw new Error('BDM POS Core URL or secret is not configured');
  const client = axios.create({
    baseURL: baseUrl,
    timeout: 60000,
    ...coreTransport(),
    headers: {
      'X-BDM-POS-Secret': secret,
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
      'User-Agent': 'BDM-POS-Server/1.0'
    }
  });
  const items = [];
  for (let page = 1; page <= 10000; page += 1) {
    const { data } = await client.get('/stock', { params: { page, per_page: PAGE_SIZE } });
    if (!data?.success || !Array.isArray(data.items)) throw new Error('BDM POS Core returned an invalid stock response');
    items.push(...data.items);
    if (!data.has_more || data.items.length === 0) break;
    if (page === 10000) throw new Error('BDM POS Core stock snapshot exceeded the safety page limit');
  }
  return { items, count: items.length, readOnly: true };
}

/** Fetch an order page through Core; this helper performs GET requests only. */
export async function fetchBdmposOrders({ page = 1, perPage = 50, after, before, status } = {}) {
  const baseUrl = getCoreBaseUrl();
  const secret = process.env.BDMPOS_CORE_SECRET;
  if (!baseUrl || !secret) throw new Error('BDM POS Core URL or secret is not configured');
  const response = await axios.get(`${baseUrl}/orders`, {
    params: {
      page: Math.max(1, Number(page) || 1),
      per_page: Math.min(PAGE_SIZE, Math.max(1, Number(perPage) || 50)),
      ...(after ? { after } : {}),
      ...(before ? { before } : {}),
      ...(status ? { status } : {})
    },
    timeout: 25000,
    ...coreTransport(),
    headers: {
      'X-BDM-POS-Secret': secret,
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
      'User-Agent': 'BDM-POS-Server/1.0'
    }
  });
  const data = response.data;
  if (!data?.success || !Array.isArray(data.orders)) throw new Error('BDM POS Core returned an invalid orders response');
  return data;
}


/** Apply an audited, idempotent manual points adjustment through Core. */
export async function mutateBdmposCustomerPoints({ customerId, action, points, note, requestId }) {
  const baseUrl = getCoreBaseUrl();
  const secret = process.env.BDMPOS_CORE_SECRET;
  if (!baseUrl || !secret) throw new Error('BDM POS Core URL or secret is not configured');
  const response = await axios.post(
    `${baseUrl}/customers/${encodeURIComponent(String(customerId))}/points`,
    { action, points, note, request_id: requestId },
    {
      timeout: 30000,
      ...coreTransport(),
      headers: {
        'X-BDM-POS-Secret': secret,
        Accept: 'application/json',
        'User-Agent': 'BDM-POS-Server/1.0'
      }
    }
  );
  if (!response.data?.success) throw new Error('BDM POS Core rejected the points adjustment');
  return response.data;
}

/** Execute order-linked Points & Rewards transactions through the Core plugin. */
export async function transactBdmposCustomerPoints({ customerId, action, points, orderId, requestId }) {
  const baseUrl = getCoreBaseUrl();
  const secret = process.env.BDMPOS_CORE_SECRET;
  if (!baseUrl || !secret) throw new Error('BDM POS Core URL or secret is not configured');
  const response = await axios.post(
    `${baseUrl}/customers/${encodeURIComponent(String(customerId))}/points/transactions`,
    { action, points, order_id: orderId, request_id: requestId },
    {
      timeout: 30000,
      ...coreTransport(),
      headers: {
        'X-BDM-POS-Secret': secret,
        Accept: 'application/json',
        'User-Agent': 'BDM-POS-Server/1.0'
      }
    }
  );
  if (!response.data?.success) throw new Error('BDM POS Core rejected the points transaction');
  return response.data;
}

/** Complete an existing WooCommerce order through Core; never creates orders. */
export async function completeBdmposOrder(orderId, note = '') {
  const baseUrl = getCoreBaseUrl();
  const secret = process.env.BDMPOS_CORE_SECRET;
  if (!baseUrl || !secret) throw new Error('BDM POS Core URL or secret is not configured');
  const response = await axios.post(
    `${baseUrl}/orders/${encodeURIComponent(String(orderId))}/complete`,
    { note },
    {
      timeout: 30000,
      ...coreTransport(),
      headers: {
        'X-BDM-POS-Secret': secret,
        Accept: 'application/json',
        'User-Agent': 'BDM-POS-Server/1.0'
      }
    }
  );
  if (!response.data?.success || !response.data.order) throw new Error('BDM POS Core returned an invalid order completion response');
  return response.data;
}


/**
 * Execute any WooCommerce wc/v3 REST operation through the authenticated Core
 * gateway. This is server-only; the Core secret must never reach the browser.
 */
export async function callBdmposWooApi({ method = 'GET', path, params = {}, data = {}, requestId = '' }) {
  const baseUrl = getCoreBaseUrl();
  const secret = process.env.BDMPOS_CORE_SECRET;
  if (!baseUrl || !secret) throw new Error('BDM POS Core URL or secret is not configured');
  const response = await axios.post(
    `${baseUrl}/woocommerce`,
    { method: String(method).toUpperCase(), path: `/${String(path || '').replace(/^\/+/, '')}`, params, body: data, ...(requestId ? { request_id: String(requestId).slice(0, 128) } : {}) },
    {
      timeout: 90000,
      ...coreTransport(),
      headers: {
        'X-BDM-POS-Secret': secret,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'BDM-POS-Server/1.0'
      }
    }
  );
  if (!response.data?.success) {
    const error = response.data?.data?.message || response.data?.message || 'BDM POS Core WooCommerce operation failed';
    throw new Error(error);
  }
  return { data: response.data.data, headers: response.headers, status: response.status };
}
