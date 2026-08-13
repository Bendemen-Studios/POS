import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import axios from 'axios';
import { fetcher } from '../lib/fetcher';

export default function AdminPanel() {
  const router = useRouter();
  
  const { data: usersData, mutate: mutateUsers } = useSWR('/api/admin/users', fetcher, { revalidateOnFocus: false });
  const { data: storesData, mutate: mutateStores } = useSWR('/api/stores', fetcher, { revalidateOnFocus: false });

  const users = usersData?.users || [];
  const stores = storesData?.stores || [];
  const isLoading = !usersData && !storesData;

  const [newStoreName, setNewStoreName] = useState('');
  const [newStoreLocation, setNewStoreLocation] = useState('');

  // State voor SumUp pairing
  const [sumupForm, setSumupForm] = useState({
    storeId: '',
    pairingCode: '',
    readerName: ''
  });

  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    role: 'cashier',
    storeId: ''
  });

  useEffect(() => {
    const token = localStorage.getItem('pos_token');
    const rawUser = localStorage.getItem('pos_user');
    if (!token && !rawUser) {
      router.push('/login');
    }
  }, [router]);

  useEffect(() => {
    if (stores.length > 0) {
      if (!form.storeId) setForm(f => ({ ...f, storeId: stores[0].id }));
      if (!sumupForm.storeId) setSumupForm(s => ({ ...s, storeId: stores[0].id }));
    }
  }, [stores]);

  const handleAddStore = async (e) => {
    e.preventDefault();
    if (!newStoreName) return;

    try {
      const res = await axios.post('/api/stores', { 
        name: newStoreName, 
        location: newStoreLocation || 'Hoofdvestiging' 
      });
      if (res.data.success) {
        setNewStoreName('');
        setNewStoreLocation('');
        mutateStores();
        alert('Winkel succesvol toegevoegd!');
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Fout bij toevoegen van winkel.');
    }
  };

  const handleDeleteStore = async (id, name) => {
    if (stores.length <= 1) {
      alert('Je moet minimaal één winkel behouden.');
      return;
    }
    if (!confirm(`Weet je zeker dat je winkel "${name}" wilt verwijderen?`)) return;

    try {
      const res = await axios.delete(`/api/stores?id=${id}`);
      if (res.data.success) {
        mutateStores();
        alert('Winkel verwijderd.');
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Fout bij verwijderen van winkel.');
    }
  };

  const handlePairSumUp = async (e) => {
    e.preventDefault();
    if (!sumupForm.pairingCode) {
      alert('Vul de pairing code van het pinapparaat in.');
      return;
    }

    try {
      const res = await axios.post('/api/admin/sumup-pair', sumupForm);
      if (res.data.success) {
        alert('Pinapparaat succesvol gekoppeld aan de winkel!');
        setSumupForm({ storeId: stores[0]?.id || '', pairingCode: '', readerName: '' });
        mutateStores();
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Fout bij koppelen van SumUp.');
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!form.username || !form.email || !form.password) {
      alert('Vul minimaal gebruikersnaam, e-mail en wachtwoord in.');
      return;
    }

    try {
      const res = await axios.post('/api/admin/users', form);
      if (res.data.success) {
        alert('Personeelslid succesvol toegevoegd!');
        setForm({
          username: '',
          email: '',
          password: '',
          firstName: '',
          lastName: '',
          role: 'cashier',
          storeId: stores[0]?.id || ''
        });
        mutateUsers();
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Fout bij aanmaken van gebruiker.');
    }
  };

  const handleDeleteUser = async (id, name) => {
    if (!confirm(`Weet je zeker dat je ${name} wilt verwijderen?`)) return;

    try {
      const res = await axios.delete(`/api/admin/users?id=${id}`);
      if (res.data.success) {
        alert('Gebruiker verwijderd.');
        mutateUsers();
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Fout bij verwijderen van gebruiker.');
    }
  };

  return (
    <div style={{ background: '#FFFFFF', color: '#111111', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', padding: '40px' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', borderBottom: '1px solid #EAEAEA', paddingBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div style={{ background: '#000', color: '#FFF', padding: '6px 10px', fontWeight: '900', borderRadius: '4px', fontSize: '16px' }}>BDM</div>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '800' }}>BENDEMEN ADMIN</h1>
          </div>
          <button 
            onClick={() => router.push('/')}
            style={{ padding: '10px 16px', background: '#000', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}
          >
            ← Terug naar Kassa
          </button>
        </div>

        {/* Winkel Beheer */}
        <div style={{ background: '#FAFAFA', padding: '30px', borderRadius: '12px', border: '1px solid #EAEAEA', marginBottom: '30px' }}>
          <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '18px', fontWeight: '800' }}>🏪 Winkel Beheer</h3>
          
          <form onSubmit={handleAddStore} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr', gap: '15px', alignItems: 'flex-end', marginBottom: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', textTransform: 'uppercase', color: '#333' }}>Winkelnaam</label>
              <input 
                type="text" 
                placeholder="Bijv. Ons Winkeltje"
                value={newStoreName}
                onChange={(e) => setNewStoreName(e.target.value)}
                required
                style={{ width: '100%', padding: '12px', border: '1px solid #DDD', borderRadius: '8px', boxSizing: 'border-box', fontSize: '14px', outline: 'none' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', textTransform: 'uppercase', color: '#333' }}>Locatie / Omschrijving</label>
              <input 
                type="text" 
                placeholder="Bijv. Hellevoetsluis"
                value={newStoreLocation}
                onChange={(e) => setNewStoreLocation(e.target.value)}
                style={{ width: '100%', padding: '12px', border: '1px solid #DDD', borderRadius: '8px', boxSizing: 'border-box', fontSize: '14px', outline: 'none' }}
              />
            </div>
            <button 
              type="submit" 
              style={{ padding: '12px', background: '#000', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}
            >
              + Winkel Toevoegen
            </button>
          </form>

          <div style={{ background: '#FFFFFF', border: '1px solid #EAEAEA', borderRadius: '8px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
              <thead>
                <tr style={{ background: '#FAFAFA', borderBottom: '1px solid #EAEAEA' }}>
                  <th style={{ padding: '12px 15px', fontWeight: '700' }}>Winkelnaam</th>
                  <th style={{ padding: '12px 15px', fontWeight: '700' }}>Locatie</th>
                  <th style={{ padding: '12px 15px', fontWeight: '700' }}>SumUp Reader / Status</th>
                  <th style={{ padding: '12px 15px', fontWeight: '700', textAlign: 'right' }}>Actie</th>
                </tr>
              </thead>
              <tbody>
                {stores.map(store => (
                  <tr key={store.id} style={{ borderBottom: '1px solid #F2F2F2' }}>
                    <td style={{ padding: '12px 15px', fontWeight: '600' }}>{store.name}</td>
                    <td style={{ padding: '12px 15px', color: '#666' }}>{store.location}</td>
                    <td style={{ padding: '12px 15px', color: store.sumup_reader_id ? '#0d904f' : '#888', fontWeight: '600' }}>
                      {store.sumup_reader_id ? `Gekoppeld (${store.sumup_reader_id})` : 'Niet gekoppeld'}
                    </td>
                    <td style={{ padding: '12px 15px', textAlign: 'right' }}>
                      <button
                        onClick={() => handleDeleteStore(store.id, store.name)}
                        style={{
                          padding: '5px 10px',
                          background: '#FCE8E6',
                          color: '#C3110C',
                          border: '1px solid #FAD2D1',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: '600'
                        }}
                      >
                        Verwijderen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* SumUp Pinapparaat Koppelen */}
        <div style={{ background: '#FAFAFA', padding: '30px', borderRadius: '12px', border: '1px solid #EAEAEA', marginBottom: '30px' }}>
          <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '18px', fontWeight: '800' }}>💳 SumUp Pinapparaat Koppelen</h3>
          <p style={{ fontSize: '13px', color: '#666', marginBottom: '20px' }}>
            Zet je SumUp lezer in de API-modus om een pairing code te genereren, selecteer de winkel en vul de code hieronder in.
          </p>

          <form onSubmit={handlePairSumUp} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', textTransform: 'uppercase', color: '#333' }}>Kies Winkel</label>
              <select 
                value={sumupForm.storeId}
                onChange={(e) => setSumupForm({ ...sumupForm, storeId: e.target.value })}
                style={{ width: '100%', padding: '12px', border: '1px solid #DDD', borderRadius: '8px', boxSizing: 'border-box', background: '#fff', fontSize: '14px', outline: 'none' }}
              >
                {stores.map(store => (
                  <option key={store.id} value={store.id}>{store.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', textTransform: 'uppercase', color: '#333' }}>Pairing Code</label>
              <input 
                type="text" 
                placeholder="Bijv. ABC123XYZ"
                value={sumupForm.pairingCode}
                onChange={(e) => setSumupForm({ ...sumupForm, pairingCode: e.target.value })}
                required
                style={{ width: '100%', padding: '12px', border: '1px solid #DDD', borderRadius: '8px', boxSizing: 'border-box', fontSize: '14px', outline: 'none' }}
              />
            </div>
            <button 
              type="submit" 
              style={{ padding: '12px', background: '#000', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}
            >
              Pinapparaat Koppelen
            </button>
          </form>
        </div>

        {/* Formulier Personeel */}
        <div style={{ background: '#FAFAFA', padding: '30px', borderRadius: '12px', border: '1px solid #EAEAEA', marginBottom: '30px' }}>
          <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '18px', fontWeight: '800' }}>Nieuw Personeel / Manager Toevoegen</h3>
          
          <form onSubmit={handleCreateUser} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', textTransform: 'uppercase', color: '#333' }}>Gebruikersnaam</label>
              <input 
                type="text" 
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
                style={{ width: '100%', padding: '12px', border: '1px solid #DDD', borderRadius: '8px', boxSizing: 'border-box', fontSize: '14px', outline: 'none' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', textTransform: 'uppercase', color: '#333' }}>E-mailadres</label>
              <input 
                type="email" 
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                style={{ width: '100%', padding: '12px', border: '1px solid #DDD', borderRadius: '8px', boxSizing: 'border-box', fontSize: '14px', outline: 'none' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', textTransform: 'uppercase', color: '#333' }}>Voornaam</label>
              <input 
                type="text" 
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                style={{ width: '100%', padding: '12px', border: '1px solid #DDD', borderRadius: '8px', boxSizing: 'border-box', fontSize: '14px', outline: 'none' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', textTransform: 'uppercase', color: '#333' }}>Achternaam</label>
              <input 
                type="text" 
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                style={{ width: '100%', padding: '12px', border: '1px solid #DDD', borderRadius: '8px', boxSizing: 'border-box', fontSize: '14px', outline: 'none' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', textTransform: 'uppercase', color: '#333' }}>Wachtwoord</label>
              <input 
                type="password" 
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                style={{ width: '100%', padding: '12px', border: '1px solid #DDD', borderRadius: '8px', boxSizing: 'border-box', fontSize: '14px', outline: 'none' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', textTransform: 'uppercase', color: '#333' }}>Rol / Functie</label>
              <select 
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                style={{ width: '100%', padding: '12px', border: '1px solid #DDD', borderRadius: '8px', boxSizing: 'border-box', background: '#fff', fontSize: '14px', outline: 'none' }}
              >
                <option value="cashier">Personeel (Kassa)</option>
                <option value="shop_manager">Manager</option>
                <option value="administrator">Administrator</option>
              </select>
            </div>

            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', textTransform: 'uppercase', color: '#333' }}>Toegewezen Winkel</label>
              <select 
                value={form.storeId}
                onChange={(e) => setForm({ ...form, storeId: e.target.value })}
                style={{ width: '100%', padding: '12px', border: '1px solid #DDD', borderRadius: '8px', boxSizing: 'border-box', background: '#fff', fontSize: '14px', outline: 'none' }}
              >
                {stores.map(store => (
                  <option key={store.id} value={store.id}>{store.name}</option>
                ))}
              </select>
            </div>

            <div style={{ gridColumn: 'span 2', marginTop: '10px' }}>
              <button 
                type="submit" 
                style={{ width: '100%', padding: '14px', background: '#C3110C', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '15px', cursor: 'pointer' }}
              >
                Gebruiker Aanmaken
              </button>
            </div>
          </form>
        </div>

        {/* Tabel met gebruikers */}
        <div style={{ background: '#FAFAFA', padding: '30px', borderRadius: '12px', border: '1px solid #EAEAEA' }}>
          <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '18px', fontWeight: '800' }}>Geregistreerd Personeel</h3>
          {isLoading ? (
            <p style={{ color: '#666', fontSize: '14px' }}>Laden...</p>
          ) : users.length === 0 ? (
            <p style={{ color: '#666', fontSize: '14px' }}>Geen gebruikers gevonden.</p>
          ) : (
            <div style={{ background: '#FFFFFF', border: '1px solid #EAEAEA', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                <thead>
                  <tr style={{ background: '#FAFAFA', borderBottom: '1px solid #EAEAEA' }}>
                    <th style={{ padding: '15px', fontWeight: '700' }}>Naam</th>
                    <th style={{ padding: '15px', fontWeight: '700' }}>E-mail</th>
                    <th style={{ padding: '15px', fontWeight: '700' }}>Rol</th>
                    <th style={{ padding: '15px', fontWeight: '700' }}>Winkel</th>
                    <th style={{ padding: '15px', fontWeight: '700', textAlign: 'right' }}>Actie</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => {
                    const matchedStore = stores.find(s => s.id === u.storeId);
                    return (
                      <tr key={u.id} style={{ borderBottom: '1px solid #F2F2F2' }}>
                        <td style={{ padding: '15px', fontWeight: '600' }}>{u.name}</td>
                        <td style={{ padding: '15px', color: '#666' }}>{u.email}</td>
                        <td style={{ padding: '15px' }}>
                          <span style={{ 
                            padding: '4px 8px', 
                            borderRadius: '4px', 
                            fontSize: '11px', 
                            fontWeight: '700',
                            background: u.role === 'administrator' ? '#FCE8E6' : u.role === 'shop_manager' ? '#E8F0FE' : '#F1F3F4',
                            color: u.role === 'administrator' ? '#C3110C' : u.role === 'shop_manager' ? '#1A73E8' : '#333'
                          }}>
                            {u.role}
                          </span>
                        </td>
                        <td style={{ padding: '15px', color: '#666' }}>{matchedStore ? matchedStore.name : u.storeId}</td>
                        <td style={{ padding: '15px', textAlign: 'right' }}>
                          <button
                            onClick={() => handleDeleteUser(u.id, u.name)}
                            style={{
                              padding: '6px 12px',
                              background: '#FCE8E6',
                              color: '#C3110C',
                              border: '1px solid #FAD2D1',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: '600'
                            }}
                          >
                            Verwijderen
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}