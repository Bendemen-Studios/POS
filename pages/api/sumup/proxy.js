const fetchSumUpReaders = async () => {
    try {
      const res = await fetch('/api/sumup/proxy?action=readers');
      const data = await res.json();
      if (data.success) {
        setSumUpReaders(data.readers || []);
      }
    } catch (err) {
      console.error('Kan geen SumUp apparaten ophalen:', err);
    }
  };

  const handlePairSumUp = async (e) => {
    e.preventDefault();
    setSumUpStatusMsg('Bezig met SumUp koppelen...');
    try {
      const res = await fetch('/api/sumup/proxy?action=pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairingCode, name: terminalName })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSumUpStatusMsg('✅ SumUp apparaat succesvol gekoppeld!');
        setPairingCode('');
        setTerminalName('');
        fetchSumUpReaders();
      } else {
        setSumUpStatusMsg(`❌ Fout: ${data.error || 'Onbekende fout'}`);
      }
    } catch (err) {
      setSumUpStatusMsg('❌ Netwerkfout bij koppelen.');
    }
  };

  const handleUnlinkSumUp = async (readerId) => {
    if (!confirm(`Weet je zeker dat je SumUp apparaat ${readerId} wilt ontkoppelen?`)) return;

    try {
      const res = await fetch(`/api/sumup/proxy?action=unlink&readerId=${readerId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert('SumUp apparaat succesvol ontkoppeld!');
        fetchSumUpReaders();
        fetchStores();
      } else {
        alert('Fout bij ontkoppelen: ' + (data.error || 'Onbekende fout'));
      }
    } catch (err) {
      alert('Netwerkfout bij ontkoppelen.');
    }
  };

  const handleAssignStoreToSumUp = async (readerId) => {
    const storeId = selectedStoreForReader[readerId];
    if (!storeId) {
      alert('Selecteer eerst een filiaal.');
      return;
    }

    try {
      const res = await fetch('/api/sumup/proxy?action=assign-store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, readerId })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(data.message);
        fetchStores();
      } else {
        alert('Fout bij toewijzen: ' + (data.error || 'Onbekende fout'));
      }
    } catch (err) {
      alert('Netwerkfout bij toewijzen aan filiaal.');
    }
  };