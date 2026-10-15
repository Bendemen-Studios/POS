import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

// Give the live login API enough time for a cold start/database query,
// while still falling back to the local cache when the server is unavailable.
const OFFLINE_TIMEOUT_MS = 15000;
const OFFLINE_PASSWORD_ITERATIONS = 210000;

function bytesToHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  if (typeof hex !== 'string' || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

async function deriveOfflinePasswordHash(password, salt, iterations = OFFLINE_PASSWORD_ITERATIONS) {
  if (!globalThis.crypto?.subtle) throw new Error('Veilige offline wachtwoordcontrole is niet beschikbaar in deze browser.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
  return bytesToHex(new Uint8Array(bits));
}

async function createOfflineCredential(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return {
    algorithm: 'PBKDF2-SHA-256',
    iterations: OFFLINE_PASSWORD_ITERATIONS,
    salt: bytesToHex(salt),
    hash: await deriveOfflinePasswordHash(password, salt),
  };
}

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const user = localStorage.getItem('pos_user');
    if (user) {
      localStorage.removeItem('selectedStore');
      localStorage.removeItem('pos_selected_store');
      window.location.replace('/select-store');
      return;
    }

    setIsChecking(false);

    // Warm the Next.js store-selection route and establish a lightweight DB
    // connection before the user submits credentials. Both are best-effort.
    router.prefetch('/select-store').catch(() => {});
    fetch('/api/auth/warmup', {
      method: 'POST',
      cache: 'no-store',
      keepalive: true,
    }).catch(() => {});
  }, [router]);

  const getCachedLogin = async (cleanUsername, enteredPassword) => {
    const cachedUser = localStorage.getItem(`pos_offline_user_${cleanUsername}`);
    const credentialKey = `pos_offline_credential_${cleanUsername}`;
    const cachedToken = localStorage.getItem(`pos_offline_token_${cleanUsername}`);
    let rawCredential = localStorage.getItem(credentialKey);

    // Offline access must also have a server-signed token so queued orders can
    // safely synchronize when the server returns.
    if (!cachedUser || !cachedToken) return false;

    // One-time migration: remove any legacy plaintext password as soon as it
    // is read, then replace it with a salted verifier if the password matches.
    const legacyPasswordKey = `pos_offline_pass_${cleanUsername}`;
    if (!rawCredential) {
      const legacyPassword = localStorage.getItem(legacyPasswordKey);
      localStorage.removeItem(legacyPasswordKey);
      if (legacyPassword !== enteredPassword) return false;
      try {
        const migrated = await createOfflineCredential(enteredPassword);
        localStorage.setItem(credentialKey, JSON.stringify(migrated));
        rawCredential = JSON.stringify(migrated);
      } catch (_) {
        return false;
      }
    }

    try {
      const credential = JSON.parse(rawCredential);
      const salt = hexToBytes(credential.salt);
      if (credential.algorithm !== 'PBKDF2-SHA-256' || !salt || !credential.hash) return false;
      const derived = await deriveOfflinePasswordHash(enteredPassword, salt, credential.iterations);
      if (derived !== credential.hash) return false;

      const userObj = JSON.parse(cachedUser);
      localStorage.setItem('pos_user', JSON.stringify(userObj));
      localStorage.setItem('pos_token', cachedToken);
      localStorage.removeItem('selectedStore');
      localStorage.removeItem('pos_selected_store');
      window.location.replace('/select-store');
      return true;
    } catch (_) {
      return false;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanUsername = username.trim().toLowerCase();
    if (!cleanUsername || !password) return;

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      if (!await getCachedLogin(cleanUsername, password)) {
        setError('Offline: geen geldige lokale inlogcache gevonden.');
      }
      return;
    }

    setLoading(true);
    let timeoutId;

    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), OFFLINE_TIMEOUT_MS);

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify({ username: cleanUsername, password }),
        signal: controller.signal,
        cache: 'no-store'
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        let serverMessage = '';
        try {
          const failedData = await res.json();
          serverMessage = failedData?.message || failedData?.error || '';
        } catch (_) {}

        // Authentication errors are not an offline condition.
        if (res.status === 400 || res.status === 401) {
          setError(serverMessage || 'Ongeldige inloggegevens.');
          setLoading(false);
          return;
        }

        throw new Error(serverMessage || `Login server returned ${res.status}`);
      }

      let data;
      try {
        data = await res.json();
      } catch (_) {
        throw new Error('Ongeldige loginresponse van de server.');
      }

      if (data.success) {
        const token = data.token;
        localStorage.setItem('pos_user', JSON.stringify(data.user));
        if (token) {
          localStorage.setItem('pos_token', token);
          localStorage.setItem(`pos_offline_token_${cleanUsername}`, token);
        }
        localStorage.setItem(`pos_offline_user_${cleanUsername}`, JSON.stringify(data.user));
        localStorage.removeItem(`pos_offline_pass_${cleanUsername}`);
        // Store data is loaded separately so slow store queries cannot delay authentication.
        localStorage.removeItem('pos_login_stores');
        localStorage.removeItem('selectedStore');
        localStorage.removeItem('pos_selected_store');

        // Do not hold up the successful login on the expensive PBKDF2 offline
        // verifier. Navigate immediately, then save the verifier in the
        // background while this page remains mounted during client routing.
        const credentialKey = `pos_offline_credential_${cleanUsername}`;
        localStorage.removeItem(credentialKey);
        createOfflineCredential(password).then((offlineCredential) => {
          // Do not overwrite a newer session if another login occurred.
          if (localStorage.getItem(`pos_offline_token_${cleanUsername}`) === token) {
            localStorage.setItem(credentialKey, JSON.stringify(offlineCredential));
          }
        }).catch((credentialError) => {
          console.warn('Offline logincache niet beschikbaar:', credentialError.message);
        });

        await router.replace('/select-store');
        return;
      }

      setError(data.message || 'Inloggen mislukt.');
      setLoading(false);
      return;
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId);
      console.warn('Server niet bereikbaar, gebruik offline login-cache.', err);
    }

    if (!await getCachedLogin(cleanUsername, password)) {
      setError('Server niet bereikbaar. Controleer de POS-server of probeer opnieuw.');
      setLoading(false);
    }
  };

  if (isChecking) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
        <div className="text-center space-y-2">
          <h1 className="text-white font-black text-xl tracking-wider">BDM POS</h1>
          <div className="text-red-600 font-bold text-xs uppercase tracking-widest">Sessie controleren...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full border border-gray-200">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-black tracking-wider text-black">BDM POS // LOGIN</h1>
          <p className="text-xs text-gray-500 mt-1 uppercase font-semibold">Meld je aan om het kassasysteem te openen</p>
        </div>
        {error && <div className="bg-red-100 border-l-4 border-red-600 text-red-700 p-3 rounded text-xs mb-4 font-semibold">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Gebruikersnaam</label>
            <input type="text" name="username" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} className="w-full p-3 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-black font-semibold" placeholder="Voer je gebruikersnaam in" required autoFocus />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Wachtwoord</label>
            <input type="password" name="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-3 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-black font-semibold" placeholder="Voer je wachtwoord in" required />
          </div>
          <button type="submit" disabled={loading} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded text-xs uppercase tracking-wider transition disabled:opacity-50">
            {loading ? 'Bezig met inloggen...' : 'Inloggen'}
          </button>
        </form>
      </div>
    </div>
  );
}
