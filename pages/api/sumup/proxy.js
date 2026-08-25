const GATEWAY = process.env.SUMUP_GATEWAY_URL || 'https://pos-sumup.vercel.app';

async function gatewayRequest(req, action) {
  const url = new URL('/api/proxy', GATEWAY);
  url.searchParams.set('action', action);
  for (const [key, value] of Object.entries(req.query || {})) {
    if (key !== 'action' && value !== undefined && value !== null) {
      url.searchParams.set(key, Array.isArray(value) ? value[0] : String(value));
    }
  }

  const headers = { 'Content-Type': 'application/json' };
  const response = await fetch(url.toString(), {
    method: req.method,
    headers,
    body: ['GET', 'HEAD', 'DELETE'].includes(req.method) ? undefined : JSON.stringify(req.body || {}),
    cache: 'no-store',
  });

  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  return { response, data };
}

export default async function handler(req, res) {
  const action = String(req.query.action || '');

  // The SumUp payment/reader actions are normally redirected client-side
  // to Vercel by pages/_app.js. Keep this endpoint as a safe server-side
  // fallback and handle the store assignment locally because that data lives
  // in the Bendemen database.
  try {
    if (action === 'assign-store' && req.method === 'POST') {
      const { storeId, readerId } = req.body || {};
      if (!storeId || !readerId) {
        return res.status(400).json({ success: false, error: 'storeId en readerId zijn verplicht.' });
      }

      const storeResponse = await fetch(`${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/admin/store`, {
        method: 'GET',
        headers: { cookie: req.headers.cookie || '' },
        cache: 'no-store',
      });
      const storeData = await storeResponse.json().catch(() => ({}));
      const stores = Array.isArray(storeData.stores) ? storeData.stores : [];
      const store = stores.find((item) => String(item.id || item.store_id) === String(storeId));
      if (!store) return res.status(404).json({ success: false, error: 'Filiaal niet gevonden.' });

      const updateResponse = await fetch(`${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/admin/store`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', cookie: req.headers.cookie || '' },
        body: JSON.stringify({ ...store, id: store.id || store.store_id, terminal_id: String(readerId) }),
      });
      const updateData = await updateResponse.json().catch(() => ({}));
      if (!updateResponse.ok || !updateData.success) {
        return res.status(updateResponse.status || 500).json({ success: false, error: updateData.error || 'Filiaal kon niet worden bijgewerkt.' });
      }

      return res.status(200).json({ success: true, message: `SumUp terminal ${readerId} gekoppeld aan ${store.store_name || store.name}.` });
    }

    if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    if (!action) return res.status(400).json({ success: false, error: 'SumUp action ontbreekt.' });
    const { response, data } = await gatewayRequest(req, action);
    return res.status(response.status).json(data);
  } catch (error) {
    console.error('[SUMUP LOCAL PROXY]', error);
    return res.status(502).json({ success: false, error: error.message || 'SumUp gateway niet bereikbaar.' });
  }
}
