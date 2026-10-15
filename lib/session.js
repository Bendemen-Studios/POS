import { createHmac, timingSafeEqual } from 'crypto';
import db, { ensureDatabaseReady } from './db';

const SESSION_TTL_SECONDS = 180 * 24 * 60 * 60;

function getSessionSecret() {
  const secret =
    process.env.JWT_SECRET ||
    process.env.POS_SESSION_SECRET ||
    process.env.WOOCOMMERCE_CONSUMER_SECRET ||
    process.env.WOO_CONSUMER_SECRET ||
    process.env.WOOCOMMERCE_SECRET ||
    process.env.POS_SUPER_ADMIN_PASSWORD;
  if (!secret) throw new Error('JWT_SECRET of POS_SESSION_SECRET moet worden ingesteld.');
  return secret;
}

function sign(payloadPart) {
  return createHmac('sha256', getSessionSecret()).update(payloadPart).digest('base64url');
}

export function createSessionToken(userId) {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    sub: String(userId),
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  try {
    const expected = Buffer.from(sign(parts[0]));
    const actual = Buffer.from(parts[1]);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (!payload?.sub || !Number.isFinite(payload.exp) || payload.exp <= now) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

export async function requireSession(req, res, { roles } = {}) {
  const authorization = req.headers?.authorization;
  const bearer = Array.isArray(authorization) ? authorization[0] : authorization;
  const token = typeof bearer === 'string' && /^Bearer\s+/i.test(bearer)
    ? bearer.replace(/^Bearer\s+/i, '').trim()
    : '';

  const payload = verifySessionToken(token);
  if (!payload) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(401).json({ success: false, error: 'Sessie ongeldig of verlopen. Log opnieuw in.' });
    return null;
  }

  try {
    await ensureDatabaseReady();
    const [rows] = await db.query(
      'SELECT id, username, email, role, store_id FROM users WHERE id = ? LIMIT 1',
      [payload.sub]
    );
    const user = Array.isArray(rows) ? rows[0] : null;
    if (!user) {
      res.setHeader('Cache-Control', 'no-store');
      res.status(401).json({ success: false, error: 'Gebruikersaccount bestaat niet meer.' });
      return null;
    }

    const isMainOwner = String(user.username || '').toLowerCase() === 'bendemen' ||
      String(user.email || '').toLowerCase() === 'bendemenbv@gmail.com';
    const effectiveUser = isMainOwner ? { ...user, role: 'super_admin' } : user;

    if (Array.isArray(roles) && roles.length > 0 &&
        !roles.includes(String(effectiveUser.role || '').toLowerCase())) {
      res.status(403).json({ success: false, error: 'Je hebt geen toestemming voor deze actie.' });
      return null;
    }

    req.posUser = effectiveUser;
    return effectiveUser;
  } catch (error) {
    console.error('[SESSION CHECK ERROR]:', error.message);
    res.status(503).json({ success: false, error: 'De POS-database is tijdelijk niet beschikbaar.' });
    return null;
  }
}

export function hasStoreAccess(user, storeId) {
  if (!user || storeId == null || String(storeId).trim() === '') return false;
  const role = String(user.role || '').toLowerCase();
  if (['admin', 'super_admin', 'administrator'].includes(role) ||
      String(user.username || '').toLowerCase() === 'bendemen') return true;
  const assigned = String(user.store_id || '').split(',').map(id => id.trim()).filter(Boolean);
  return assigned.includes(String(storeId));
}

export function requireStoreAccess(req, res, storeId) {
  if (hasStoreAccess(req.posUser, storeId)) return true;
  res.status(403).json({ success: false, error: 'Je account is niet gekoppeld aan dit filiaal.' });
  return false;
}
