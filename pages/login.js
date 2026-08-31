import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

const OFFLINE_TIMEOUT_MS = 2500;

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
    } else {
      setIsChecking(false);
    }
  }, [router]);

  const getCachedLogin = (cleanUsername, enteredPassword) => {
    const cachedUser = localStorage.getItem(`pos_offline_user_${cleanUsername}`);
    const cachedPass = localStorage.getItem(`pos_offline_pass_${cleanUsername}`);
    if (!cachedUser || cachedPass !== enteredPassword) return false;
    try {
      const userObj = JSON.parse(cachedUser);
      localStorage.setItem('pos_user', JSON.stringify(userObj));
      localStorage.removeItem('selectedStore');
      localStorage.removeItem('pos_selected_store');
      window.location.replace('/select-store');
      return true;
    } catch (_) { return false; }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const cleanUsername = username.trim().toLowerCase();

    let timeoutId;
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), OFFLINE_TIMEOUT_MS);
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
        body: JSON.stringify({ username: cleanUsername, password }),
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(timeoutId);
      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem('pos_user', JSON.stringify(data.user));
        if (data.token) localStorage.setItem('pos_token', data.token);
        localStorage.setItem(`pos_offline_user_${cleanUsername}`, JSON.stringify(data.user));
        localStorage.setItem(`pos_offline_pass_${cleanUsername}`, password);
        localStorage.removeItem('selectedStore');
        localStorage.removeItem('pos_selected_store');
        window.location.replace('/select-store');
        return;
      }
      setError(data.message || 'Inloggen mislukt.');
      setLoading(false);
      return;
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId);
      console.warn('Server niet bereikbaar, controleer offline login-cache...', err);
    }

    if (!getCachedLogin(cleanUsername, password)) {
      setError('Geen verbinding met de server en geen geldige lokale inlogcache gevonden.');
      setLoading(false);
    }
  };

  if (isChecking) return <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4"><div className="text-center space-y-2"><h1 className="text-white font-black text-xl tracking-wider">BDM POS</h1><div className="text-red-600 font-bold text-xs uppercase tracking-widest animate-pulse">Sessie controleren...</div></div></div>;

  return <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4"><div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full border border-gray-200"><div className="text-center mb-8"><h1 className="text-2xl font-black tracking-wider text-black">BDM POS // LOGIN</h1><p className="text-xs text-gray-500 mt-1 uppercase font-semibold">Meld je aan om het kassasysteem te openen</p></div>{error && <div className="bg-red-100 border-l-4 border-red-600 text-red-700 p-3 rounded text-xs mb-4 font-semibold">{error}</div>}<form onSubmit={handleSubmit} className="space-y-4"><div><label className="block text-xs font-bold text-gray-700 uppercase mb-1">Gebruikersnaam</label><input type="text" name="username" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} className="w-full p-3 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-black font-semibold" placeholder="Voer je gebruikersnaam in" required autoFocus /></div><div><label className="block text-xs font-bold text-gray-700 uppercase mb-1">Wachtwoord</label><input type="password" name="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-3 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-black font-semibold" placeholder="Voer je wachtwoord in" required /></div><button type="submit" disabled={loading} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded text-xs uppercase tracking-wider transition disabled:opacity-50">{loading ? 'Bezig met inloggen...' : 'Inloggen'}</button></form></div></div>;
}
