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
