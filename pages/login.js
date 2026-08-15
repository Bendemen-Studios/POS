import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const user = localStorage.getItem('pos_user');
    if (user) {
      router.push('/');
    }
  }, [router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();

      if (data.success) {
        localStorage.setItem('pos_user', JSON.stringify(data.user));
        if (data.token) localStorage.setItem('pos_token', data.token);
        router.push('/');
      } else {
        setError(data.message || 'Inloggen mislukt.');
      }
    } catch (err) {
      console.error(err);
      setError('Er is een fout opgetreden bij het verbinden met de server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-black tracking-wider text-black">BDM POS // LOGIN</h1>
          <p className="text-xs text-gray-500 mt-1 uppercase font-semibold">Meld je aan om het kassasysteem te openen</p>
        </div>

        {error && (
          <div className="bg-red-100 border-l-4 border-red-600 text-red-700 p-3 rounded text-xs mb-4 font-semibold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Gebruikersnaam</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-black font-semibold"
              placeholder="Voer je gebruikersnaam in"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Wachtwoord</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-black font-semibold"
              placeholder="Voer je wachtwoord in"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded text-xs uppercase tracking-wider transition disabled:opacity-50"
          >
            {loading ? 'Bezig met inloggen...' : 'Inloggen'}
          </button>
        </form>
      </div>
    </div>
  );
}