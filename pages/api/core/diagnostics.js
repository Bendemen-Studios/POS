import axios from 'axios';
import { executeBdmposCoreViaQueue } from '../../../lib/bdmpos-core-queue';
import { getWooHttpsAgent } from '../../../lib/woocommerce-transport';

function coreBaseUrl() {
  const configured = String(process.env.BDMPOS_CORE_URL || '').trim().replace(/\/+$/, '');
  if (!configured) return '';
  if (/\/wp-json\/bdmpos\/v1$/i.test(configured)) return configured;
  if (/\/wp-json$/i.test(configured)) return configured + '/bdmpos/v1';
  return configured + '/wp-json/bdmpos/v1';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ success: false, error: 'Method not allowed' }); }
  try {
  const baseUrl = coreBaseUrl();
  const secret = process.env.BDMPOS_CORE_SECRET || '';
  const checks = [];
  if (!baseUrl || secret.length < 32) {
    return res.status(200).json({ success: false, checks: [{ label: 'POS-configuratie', ok: false, status: 'Niet goed ingesteld', detail: 'BDMPOS_CORE_URL ontbreekt of BDMPOS_CORE_SECRET is korter dan 32 tekens.' }], checkedAt: new Date().toISOString() });
  }
  try {
    const health = await executeBdmposCoreViaQueue({ method: 'GET', route: '/bdmpos/v1/health', timeoutMs: 18000 });
    checks.push({ label: 'POS → WordPress/Core via worker', ok: health.status === 200 && health.data?.success === true, status: health.status === 200 ? 'Verbonden via reverse bridge' : 'HTTP ' + health.status, detail: health.data?.service ? 'Core ' + health.data.service + ' v' + health.data.version : '' });
  } catch (error) {
    checks.push({ label: 'POS → WordPress/Core via worker', ok: false, status: 'Niet verwerkt', detail: error.message || 'WordPress-worker heeft de aanvraag niet bevestigd.' });
  }
  const commandUrl = String(process.env.BDMPOS_CORE_COMMAND_URL || '').trim();
  if (!commandUrl) {
    checks.push({ label: 'POS-opdrachtenendpoint', ok: false, status: 'Niet apart getest', detail: 'BDMPOS_CORE_COMMAND_URL ontbreekt. De WordPress-worker gebruikt de URL die in WooCommerce is ingesteld.' });
  } else {
    try {
      const probe = await axios.get(commandUrl, {
        params: { action: 'probe' },
        headers: { 'X-BDM-POS-Secret': secret },
        timeout: 10000,
      });
      checks.push({ label: 'POS-opdrachtenendpoint', ok: probe.status === 200 && probe.data?.authenticated === true, status: probe.status === 200 ? 'Authenticatie akkoord' : 'HTTP ' + probe.status, detail: 'Niet-mutatieve probe; er zijn geen opdrachten opgehaald.' });
    } catch (error) {
      checks.push({ label: 'POS-opdrachtenendpoint', ok: false, status: 'Niet bereikbaar', detail: error.code || error.message });
    }
  }
  return res.status(200).json({ success: checks.every(check => check.ok), checks, checkedAt: new Date().toISOString() });
  } catch (error) {
    console.error('[CORE DIAGNOSTICS]', error);
    return res.status(200).json({ success: false, error: error.message || 'Core-diagnostiek kon niet worden uitgevoerd.', checks: [], checkedAt: new Date().toISOString() });
  }
}
