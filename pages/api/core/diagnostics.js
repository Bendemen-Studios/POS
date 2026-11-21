import axios from 'axios';
import db from '../../../lib/db';

function coreBaseUrl() {
  const configured = String(process.env.BDMPOS_CORE_URL || '').trim().replace(/\/+$/, '');
  if (!configured) return '';
  if (/\/wp-json\/bdmpos\/v1$/i.test(configured)) return configured;
  if (/\/wp-json$/i.test(configured)) return configured + '/bdmpos/v1';
  return configured + '/wp-json/bdmpos/v1';
}

async function checkDatabaseAndQueue() {
  const checks = [];
  try {
    // Read-only ping with a short timeout. Do not initialize tables or run DDL
    // from diagnostics: that can block behind database locks and trigger proxy 504s.
    await db.query({ sql: 'SELECT 1 AS ok', timeout: 3000 });
    checks.push({
      label: 'POS-database',
      ok: true,
      status: 'Verbonden',
      detail: 'Database reageert op een read-only controle.'
    });

    const [tables] = await db.query({
      sql: "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pos_core_commands' LIMIT 1",
      timeout: 3000
    });
    if (!tables?.length) {
      checks.push({
        label: 'Core-wachtrij',
        ok: false,
        status: 'Tabel ontbreekt',
        detail: 'De wachtrijtabel bestaat nog niet. De diagnostiek maakt deze bewust niet automatisch aan.'
      });
      return checks;
    }

    const [rows] = await db.query({
      sql: "SELECT status, COUNT(*) AS total FROM pos_core_commands GROUP BY status",
      timeout: 3000
    });
    const counts = Object.fromEntries((rows || []).map(row => [String(row.status), Number(row.total) || 0]));
    const pending = counts.pending || 0;
    const processing = counts.processing || 0;
    const failed = counts.failed || 0;
    checks.push({
      label: 'Core-wachtrij',
      ok: true,
      status: 'Bereikbaar',
      detail: pending + ' wachtend, ' + processing + ' in verwerking, ' + failed + ' mislukt. Alleen gelezen; niets opgehaald of aangepast.'
    });
  } catch (error) {
    checks.push({
      label: 'POS-database / Core-wachtrij',
      ok: false,
      status: 'Niet bereikbaar',
      detail: error.code || error.message || 'Databasecontrole mislukt.'
    });
  }
  return checks;
}

async function checkCommandEndpoint(secret) {
  const commandUrl = String(process.env.BDMPOS_CORE_COMMAND_URL || '').trim();
  if (!commandUrl) {
    return {
      label: 'POS-opdrachtenendpoint',
      ok: false,
      status: 'Niet ingesteld',
      detail: 'BDMPOS_CORE_COMMAND_URL ontbreekt.'
    };
  }

  try {
    const probe = await axios.get(commandUrl, {
      params: { action: 'probe' },
      headers: { 'X-BDM-POS-Secret': secret },
      timeout: 3000
    });
    const authenticated = probe.status === 200 && probe.data?.authenticated === true;
    return {
      label: 'POS-opdrachtenendpoint',
      ok: authenticated,
      status: authenticated ? 'Endpoint en authenticatie akkoord' : 'Onverwacht antwoord',
      detail: 'Alleen de beveiligde probe is uitgevoerd; er zijn geen opdrachten opgehaald.'
    };
  } catch (error) {
    return {
      label: 'POS-opdrachtenendpoint',
      ok: false,
      status: 'Niet bereikbaar',
      detail: error.code || error.message || 'Endpointcontrole mislukt.'
    };
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const checkedAt = new Date().toISOString();
  const baseUrl = coreBaseUrl();
  const secret = process.env.BDMPOS_CORE_SECRET || '';
  if (!baseUrl || secret.length < 32) {
    return res.status(200).json({
      success: false,
      checks: [{
        label: 'POS-configuratie',
        ok: false,
        status: 'Niet goed ingesteld',
        detail: 'BDMPOS_CORE_URL ontbreekt of BDMPOS_CORE_SECRET is korter dan 32 tekens.'
      }],
      checkedAt
    });
  }

  try {
    // Run independent, read-only checks concurrently to stay well below common
    // reverse-proxy timeouts. Crucially, this endpoint never inserts a queue job.
    const [databaseChecks, endpointCheck] = await Promise.all([
      checkDatabaseAndQueue(),
      checkCommandEndpoint(secret)
    ]);
    const checks = [...databaseChecks, endpointCheck];
    checks.push({
      label: 'WordPress-worker',
      ok: null,
      status: 'Niet gestart door deze test',
      detail: 'De worker wordt bewust niet geactiveerd: de test maakt geen opdracht aan en verandert niets in de wachtrij.'
    });
    return res.status(200).json({
      success: checks.filter(check => check.ok !== null).every(check => check.ok),
      checks,
      checkedAt
    });
  } catch (error) {
    console.error('[CORE DIAGNOSTICS]', error);
    return res.status(200).json({
      success: false,
      error: error.message || 'Core-diagnostiek kon niet worden uitgevoerd.',
      checks: [],
      checkedAt
    });
  }
}
