import crypto from 'crypto';
import db from './db';

let tableReady;
async function ensureQueueTable() {
  if (!tableReady) {
    tableReady = db.query(`
      CREATE TABLE IF NOT EXISTS pos_core_commands (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        command_id VARCHAR(128) NOT NULL UNIQUE,
        action VARCHAR(64) NOT NULL,
        payload JSON NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        attempts INT NOT NULL DEFAULT 0,
        result JSON DEFAULT NULL,
        last_error VARCHAR(500) DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        claimed_at TIMESTAMP NULL,
        completed_at TIMESTAMP NULL,
        INDEX idx_status_created (status, created_at),
        INDEX idx_status_claimed (status, claimed_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch(error => { tableReady = null; throw error; });
  }
  await tableReady;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function executeBdmposCoreViaQueue({ method = 'GET', route, params = {}, body = {}, timeoutMs = 115000 }) {
  if (!/^\/bdmpos\/v1\/[a-zA-Z0-9_/-]+$/.test(String(route || '')) || String(route).includes('..')) {
    throw new Error('Ongeldige BDM POS Core-route');
  }
  await ensureQueueTable();
  const commandId = crypto.randomUUID();
  const payload = { method: String(method).toUpperCase(), route, params, body };
  await db.query(
    "INSERT INTO pos_core_commands (command_id, action, payload) VALUES (?, 'core.request', ?)",
    [commandId, JSON.stringify(payload)]
  );
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const [rows] = await db.query(
      'SELECT status, result, last_error FROM pos_core_commands WHERE command_id = ? LIMIT 1',
      [commandId]
    );
    const command = rows?.[0];
    if (command?.status === 'complete') {
      let result = command.result;
      if (typeof result === 'string') { try { result = JSON.parse(result); } catch (_) {} }
      const status = Number(result?.http_status || 200);
      const data = result?.data ?? result;
      if (status < 200 || status >= 300) {
        const error = new Error(data?.message || data?.error || 'BDM POS Core request failed (HTTP ' + status + ')');
        error.response = { status, data };
        throw error;
      }
      return { status, data, headers: {} };
    }
    if (command?.status === 'failed') {
      throw new Error(command.last_error || 'BDM POS Core worker kon de opdracht niet uitvoeren.');
    }
    await sleep(1500);
  }
  throw new Error('Timeout: WordPress heeft de Core-aanvraag nog niet verwerkt. De opdracht blijft in de wachtrij; probeer niet met een nieuwe opdracht dezelfde mutatie uit te voeren.');
}

export async function bdmposQueueAxiosAdapter(config) {
  const base = config.baseURL || process.env.BDMPOS_CORE_URL || 'https://invalid.local/wp-json/bdmpos/v1';
  const url = new URL(config.url || '/', base);
  const marker = '/wp-json/bdmpos/v1';
  const markerIndex = url.pathname.indexOf(marker);
  const routePath = markerIndex >= 0 ? url.pathname.slice(markerIndex + marker.length) : url.pathname;
  const route = '/bdmpos/v1' + (routePath.startsWith('/') ? routePath : '/' + routePath);
  const params = { ...Object.fromEntries(url.searchParams.entries()), ...(config.params || {}) };
  let body = config.data || {};
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  const result = await executeBdmposCoreViaQueue({
    method: String(config.method || 'GET').toUpperCase(),
    route,
    params,
    body: body && typeof body === 'object' ? body : {},
    timeoutMs: 115000
  });
  return { data: result.data, status: result.status, statusText: 'OK', headers: result.headers, config, request: {} };
}
