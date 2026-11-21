import axios from 'axios';
import { getWooHttpsAgent } from '../../../lib/woocommerce-transport';

function coreBaseUrl() {
  const configured = String(process.env.BDMPOS_CORE_URL || '').trim().replace(/\/+$/, '');
  if (!configured) return '';
  if (/\/wp-json\/bdmpos\/v1$/i.test(configured)) return configured;
  if (/\/wp-json$/i.test(configured)) return configured + '/bdmpos/v1';
  return configured + '/wp-json/bdmpos/v1';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  const baseUrl = coreBaseUrl();
  const secret = process.env.BDMPOS_CORE_SECRET || '';
  const checks = [];
  if (!baseUrl || secret.length < 32) {
    return res.status(200).json({ success: false, checks: [{ label: 'POS-configuratie', ok: false, status: 'Niet goed ingesteld', detail: 'BDMPOS_CORE_URL ontbreekt of BDMPOS_CORE_SECRET is korter dan 32 tekens.' }], checkedAt: new Date().toISOString() });
  }
  const client = axios.create({ timeout: 12000, httpsAgent: getWooHttpsAgent(), validateStatus: () => true, headers: { 'X-BDM-POS-Secret': secret, Accept: 'application/json', 'User-Agent': 'BDM-POS-Core-Diagnostics/1.0' } });
  try {
    const health = await client.get(baseUrl + '/health');
    checks.push({ label: 'POS → WordPress/Core', ok: health.status === 200, status: health.status === 200 ? 'Verbonden — HTTP 200' : 'HTTP ' + health.status, detail: health.status === 401 ? 'WordPress weigert de POS-secret.' : '' });
  } catch (error) {
    checks.push({ label: 'POS → WordPress/Core', ok: false, status: 'Niet bereikbaar', detail: error.code || error.message });
  }
  const commandUrl = String(process.env.BDMPOS_CORE_COMMAND_URL || '').trim();
  if (!commandUrl) {
    checks.push({ label: 'POS-opdrachtenendpoint', ok: false, status: 'Niet apart getest', detail: 'BDMPOS_CORE_COMMAND_URL ontbreekt. De WordPress-worker gebruikt de URL die in WooCommerce is ingesteld.' });
  } else {
    try {
      const probe = await client.get(commandUrl, { params: { action: 'probe' } });
      checks.push({ label: 'POS-opdrachtenendpoint', ok: probe.status === 200 && probe.data?.authenticated === true, status: probe.status === 200 ? 'Authenticatie akkoord' : 'HTTP ' + probe.status, detail: 'Niet-mutatieve probe; er zijn geen opdrachten opgehaald.' });
    } catch (error) {
      checks.push({ label: 'POS-opdrachtenendpoint', ok: false, status: 'Niet bereikbaar', detail: error.code || error.message });
    }
  }
  return res.status(200).json({ success: checks.every(check => check.ok), checks, checkedAt: new Date().toISOString() });
}
