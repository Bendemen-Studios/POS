import axios from 'axios';
import { getWooHttpsAgent } from './woocommerce-transport';

const PAGE_SIZE = 100;

/**
 * Fetch the WooCommerce catalog through the authenticated BDM POS Core bridge.
 * This module is server-only: the secret is read from process.env and must
 * never be exposed to browser code.
 */
export async function fetchBdmposCatalog() {
  const baseUrl = String(process.env.BDMPOS_CORE_URL || '').replace(/\/+$/, '');
  const secret = process.env.BDMPOS_CORE_SECRET;
  if (!baseUrl || !secret) throw new Error('BDM POS Core URL or secret is not configured');

  const client = axios.create({
    baseURL: baseUrl,
    timeout: 40000,
    httpsAgent: getWooHttpsAgent(),
    headers: {
      'X-BDM-POS-Secret': secret,
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
      'User-Agent': 'BDM-POS-Server/1.0'
    }
  });

  const products = [];
  for (let page = 1; page <= 10000; page += 1) {
    const { data } = await client.get('/wp-json/bdmpos/v1/catalog', {
      params: { page, per_page: PAGE_SIZE }
    });
    if (!data?.success || !Array.isArray(data.products)) {
      throw new Error('BDM POS Core returned an invalid catalog response');
    }
    products.push(...data.products);
    if (!data.has_more || data.products.length === 0) break;
    if (page === 10000) throw new Error('BDM POS Core catalog exceeded the safety page limit');
  }

  const { data: categoryResponse } = await client.get('/wp-json/bdmpos/v1/categories');
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
  const baseUrl = String(process.env.BDMPOS_CORE_URL || '').replace(/\/+$/, '');
  const secret = process.env.BDMPOS_CORE_SECRET;
  if (!baseUrl || !secret) throw new Error('BDM POS Core URL or secret is not configured');

  const client = axios.create({
    baseURL: baseUrl,
    timeout: 40000,
    httpsAgent: getWooHttpsAgent(),
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
    const { data } = await client.get('/wp-json/bdmpos/v1/customers', {
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
  const baseUrl = String(process.env.BDMPOS_CORE_URL || '').replace(/\/+$/, '');
  const secret = process.env.BDMPOS_CORE_SECRET;
  if (!baseUrl || !secret) throw new Error('BDM POS Core URL or secret is not configured');
  const response = await axios.get(
    `${baseUrl}/wp-json/bdmpos/v1/customers/${encodeURIComponent(String(customerId))}/points`,
    {
      timeout: 20000,
      httpsAgent: getWooHttpsAgent(),
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
