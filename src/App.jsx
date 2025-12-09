import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, Clock, Trash2, Download, Search, RefreshCw } from 'lucide-react';

const AddressParserRealAPI = () => {
  const [fullAddress, setFullAddress] = useState('');
  const [parsedData, setParsedData] = useState({
    provinsi: '',
    provinsiId: '',
    kota: '',
    kotaId: '',
    kecamatan: '',
    kecamatanId: '',
    kelurahan: '',
    kelurahanId: '',
    kodePos: '',
    jalan: '',
    rt: '',
    rw: '',
    confidence: {}
  });

  // Data from API
  const [provinces, setProvinces] = useState([]);
  const [regencies, setRegencies] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [villages, setVillages] = useState([]);

  const [isLoading, setIsLoading] = useState(false);
  const [apiStatus, setApiStatus] = useState('');
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  // Load provinces on mount
  useEffect(() => {
    loadProvinces();
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const result = await window.storage.list('address:');
      if (result && result.keys) {
        const historyItems = [];
        for (const key of result.keys.slice(0, 10)) {
          const item = await window.storage.get(key);
          if (item) {
            historyItems.push(JSON.parse(item.value));
          }
        }
        setHistory(historyItems.sort((a, b) =>
          new Date(b.timestamp) - new Date(a.timestamp)
        ));
      }
    } catch (error) {
      console.log('No history found');
    }
  };

  // Load all provinces from API
  const loadProvinces = async () => {
    try {
      setApiStatus('Memuat data provinsi...');
      const response = await fetch('https://www.emsifa.com/api-wilayah-indonesia/api/provinces.json');
      const data = await response.json();
      setProvinces(data);
      setApiStatus('');
    } catch (error) {
      console.error('Error loading provinces:', error);
      setApiStatus('Error loading provinces');
    }
  };

  // Load regencies when province is selected
  const loadRegencies = async (provinceId) => {
    try {
      setApiStatus('Memuat data kota/kabupaten...');
      const response = await fetch(`https://www.emsifa.com/api-wilayah-indonesia/api/regencies/${provinceId}.json`);
      const data = await response.json();
      setRegencies(data);
      setApiStatus('');
    } catch (error) {
      console.error('Error loading regencies:', error);
      setRegencies([]);
    }
  };

  // Load districts when regency is selected
  const loadDistricts = async (regencyId) => {
    try {
      setApiStatus('Memuat data kecamatan...');
      const response = await fetch(`https://www.emsifa.com/api-wilayah-indonesia/api/districts/${regencyId}.json`);
      const data = await response.json();
      setDistricts(data);
      setApiStatus('');
    } catch (error) {
      console.error('Error loading districts:', error);
      setDistricts([]);
    }
  };

  // Load villages when district is selected
  const loadVillages = async (districtId) => {
    try {
      setApiStatus('Memuat data kelurahan/desa...');
      const response = await fetch(`https://www.emsifa.com/api-wilayah-indonesia/api/villages/${districtId}.json`);
      const data = await response.json();
      setVillages(data);
      setApiStatus('');
    } catch (error) {
      console.error('Error loading villages:', error);
      setVillages([]);
    }
  };

  // Lookup Postal Code
  const lookupPostalCode = async (villageName, districtName) => {
    if (!villageName) return;

    try {
      setApiStatus('Mencari kode pos...');
      const response = await fetch(`https://kodepos.vercel.app/search/?q=${villageName}`);
      const data = await response.json();

      if (data.code === 200 && data.messages) {
        // Filter by district if possible
        const cleanDistrict = districtName ? districtName.replace(/^(KECAMATAN)\s+/i, '').toLowerCase() : '';

        const match = data.messages.find(m => {
          const apiUrban = m.urban.toLowerCase();
          const apiSubdistrict = m.subdistrict.toLowerCase();
          const targetUrban = villageName.toLowerCase();

          return apiUrban === targetUrban &&
            (cleanDistrict ? apiSubdistrict.includes(cleanDistrict) : true);
        });

        if (match) {
          setParsedData(prev => ({
            ...prev,
            kodePos: match.postal_code,
            confidence: { ...prev.confidence, kodePos: 90 }
          }));
        } else if (data.messages.length > 0) {
          setParsedData(prev => ({
            ...prev,
            kodePos: data.messages[0].postal_code,
            confidence: { ...prev.confidence, kodePos: 70 }
          }));
        }
      }
      setApiStatus('');
    } catch (error) {
      console.error('Error looking up postal code:', error);
      setApiStatus('Gagal memuat kode pos'); // Feedback for user
    }
  };

  // Auto-parse address using fuzzy matching
  const parseAddressAuto = async (address) => {
    if (!address || address.length < 10) return;

    setIsLoading(true);
    setApiStatus('Menganalisis alamat...');

    const lowerAddress = address.toLowerCase();
    let foundProvince = null;
    let foundRegency = null;
    let foundDistrict = null;
    let foundVillage = null;

    // Detect RT/RW
    let rtValue = '';
    let rwValue = '';

    // 1. Try combined pattern: RT/RW 001/002 or RT/RW 01/02
    const combinedMatch = address.match(/(?:RT\s*[\/]?\s*RW|RT\s*RW)[\s\.:]*0*(\d{1,3})[\s\/]*0*(\d{1,3})/i);

    if (combinedMatch) {
      rtValue = combinedMatch[1];
      rwValue = combinedMatch[2];
    } else {
      // 2. Try separate patterns
      const rtMatch = address.match(/(?:RT[\s\.:]*)0*(\d{1,3})/i);
      const rwMatch = address.match(/(?:RW[\s\.:]*)0*(\d{1,3})/i);

      if (rtMatch) rtValue = rtMatch[1];
      if (rwMatch) rwValue = rwMatch[1];
    }

    // Apply padding
    if (rtValue) rtValue = rtValue.padStart(3, '0');
    if (rwValue) rwValue = rwValue.padStart(3, '0');

    setParsedData(prev => ({
      ...prev,
      rt: rtValue,
      rw: rwValue,
      confidence: {
        ...prev.confidence,
        rt: rtValue ? 90 : 0,
        rw: rwValue ? 90 : 0
      }
    }));

    // Find Province
    for (const prov of provinces) {
      if (lowerAddress.includes(prov.name.toLowerCase())) {
        foundProvince = prov;
        break;
      }
    }

    if (foundProvince) {
      setParsedData(prev => ({
        ...prev,
        provinsi: foundProvince.name,
        provinsiId: foundProvince.id,
        confidence: { ...prev.confidence, provinsi: 95 }
      }));

      // Load and find Regency
      try {
        const regResponse = await fetch(`https://www.emsifa.com/api-wilayah-indonesia/api/regencies/${foundProvince.id}.json`);
        const regData = await regResponse.json();
        setRegencies(regData);

        // Specific matching for Regency to distinguish Kota vs Kabupaten
        let bestRegency = null;
        let matchType = 0; // 0: None, 1: Name only (Weak), 2: Full specific match (Strong)

        for (const reg of regData) {
          const regFull = reg.name.toLowerCase(); // e.g. "kabupaten bandung"
          const regNameOnly = reg.name.replace(/^(KABUPATEN|KOTA)\s+/i, '').toLowerCase(); // e.g. "bandung"

          // Check for specific match first (Strongest)
          // Matches "kabupaten bandung" or "kab. bandung"
          const isKab = regFull.startsWith('kabupaten');
          const specificPattern = isKab
            ? new RegExp(`(kabupaten|kab\\.?)\\s+${regNameOnly}`, 'i')
            : new RegExp(`(kota)\\s+${regNameOnly}`, 'i');

          if (specificPattern.test(address)) {
            bestRegency = reg;
            matchType = 2;
            break; // Found exact specific match, stop looking
          }

          // fallback: check for name only if we haven't found a strong match yet
          if (matchType < 1 && lowerAddress.includes(regNameOnly)) {
            bestRegency = reg;
            matchType = 1;
          }
        }

        foundRegency = bestRegency;

        if (foundRegency) {
          setParsedData(prev => ({
            ...prev,
            kota: foundRegency.name,
            kotaId: foundRegency.id,
            confidence: { ...prev.confidence, kota: matchType === 2 ? 95 : 85 }
          }));

          // Load and find District
          const distResponse = await fetch(`https://www.emsifa.com/api-wilayah-indonesia/api/districts/${foundRegency.id}.json`);
          const distData = await distResponse.json();
          setDistricts(distData);

          for (const dist of distData) {
            if (lowerAddress.includes(dist.name.toLowerCase())) {
              foundDistrict = dist;
              break;
            }
          }

          if (foundDistrict) {
            setParsedData(prev => ({
              ...prev,
              kecamatan: foundDistrict.name,
              kecamatanId: foundDistrict.id,
              confidence: { ...prev.confidence, kecamatan: 85 }
            }));

            // Load and find Village
            const villResponse = await fetch(`https://www.emsifa.com/api-wilayah-indonesia/api/villages/${foundDistrict.id}.json`);
            const villData = await villResponse.json();
            setVillages(villData);

            for (const vill of villData) {
              if (lowerAddress.includes(vill.name.toLowerCase())) {
                foundVillage = vill;
                break;
              }
            }

            if (foundVillage) {
              setParsedData(prev => ({
                ...prev,
                kelurahan: foundVillage.name,
                kelurahanId: foundVillage.id,
                confidence: { ...prev.confidence, kelurahan: 85 }
              }));

              // Trigger postal code lookup
              lookupPostalCode(foundVillage.name, foundDistrict.name);
            }
          }
        }
      } catch (error) {
        console.error('Error in parsing:', error);
      }
    }

    // Extract postal code
    const postalMatch = address.match(/\b\d{5}\b/);
    if (postalMatch) {
      setParsedData(prev => ({
        ...prev,
        kodePos: postalMatch[0],
        confidence: { ...prev.confidence, kodePos: 100 }
      }));
    }

    // Extract street address - improved to stop before kelurahan/kecamatan
    let jalan = '';

    // Try to find the street portion before administrative divisions
    const parts = address.split(/\s+/);
    const stopWords = ['kelurahan', 'kel', 'kecamatan', 'kec', 'kabupaten', 'kab', 'kota', 'rt', 'rw', 'dki', 'jawa'];

    // Build street address until we hit administrative divisions
    let streetParts = [];
    let foundAdminDiv = false;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].toLowerCase();

      // Check if this part matches any found village/district name
      if (foundVillage && foundVillage.name.toLowerCase().split(/\s+/).some(vName =>
        part.includes(vName.toLowerCase()) && vName.length > 3
      )) {
        foundAdminDiv = true;
        break;
      }

      if (foundDistrict && foundDistrict.name.toLowerCase().split(/\s+/).some(dName =>
        part.includes(dName.toLowerCase()) && dName.length > 3
      )) {
        foundAdminDiv = true;
        break;
      }

      // Stop at RT/RW pattern
      if (part.match(/^(rt|rw)\.?$/i) || part.match(/^(rt|rw)\.?\d+$/i)) {
        foundAdminDiv = true;
        break;
      }

      // Stop at common administrative keywords
      if (stopWords.some(sw => part === sw || part.startsWith(sw + '.'))) {
        foundAdminDiv = true;
        break;
      }

      streetParts.push(parts[i]);
    }

    if (streetParts.length > 0) {
      jalan = streetParts.join(' ').trim();

      // Clean up trailing commas
      jalan = jalan.replace(/,\s*$/, '');

      setParsedData(prev => ({
        ...prev,
        jalan,
        confidence: { ...prev.confidence, jalan: 80 }
      }));
    }

    setIsLoading(false);
    setApiStatus('✓ Parsing selesai');
    setTimeout(() => setApiStatus(''), 2000);
  };

  // Debounced auto-parse
  useEffect(() => {
    if (fullAddress.trim().length > 15) {
      const debounce = setTimeout(() => {
        parseAddressAuto(fullAddress);
      }, 1500);
      return () => clearTimeout(debounce);
    }
  }, [fullAddress, provinces]);

  // Handle manual selection changes
  const handleProvinceChange = (e) => {
    const selectedId = e.target.value;
    const province = provinces.find(p => p.id === selectedId);

    if (province) {
      setParsedData(prev => ({
        ...prev,
        provinsi: province.name,
        provinsiId: selectedId,
        kota: '',
        kotaId: '',
        kecamatan: '',
        kecamatanId: '',
        kelurahan: '',
        kelurahanId: '',
        confidence: { ...prev.confidence, provinsi: 100 }
      }));
      loadRegencies(selectedId);
      setDistricts([]);
      setVillages([]);
    }
  };

  const handleRegencyChange = (e) => {
    const selectedId = e.target.value;
    const regency = regencies.find(r => r.id === selectedId);

    if (regency) {
      setParsedData(prev => ({
        ...prev,
        kota: regency.name,
        kotaId: selectedId,
        kecamatan: '',
        kecamatanId: '',
        kelurahan: '',
        kelurahanId: '',
        confidence: { ...prev.confidence, kota: 100 }
      }));
      loadDistricts(selectedId);
      setVillages([]);
    }
  };

  const handleDistrictChange = (e) => {
    const selectedId = e.target.value;
    const district = districts.find(d => d.id === selectedId);

    if (district) {
      setParsedData(prev => ({
        ...prev,
        kecamatan: district.name,
        kecamatanId: selectedId,
        kelurahan: '',
        kelurahanId: '',
        confidence: { ...prev.confidence, kecamatan: 100 }
      }));
      loadVillages(selectedId);
    }
  };

  const handleVillageChange = (e) => {
    const selectedId = e.target.value;
    const village = villages.find(v => v.id === selectedId);

    if (village) {
      setParsedData(prev => ({
        ...prev,
        kelurahan: village.name,
        kelurahanId: selectedId,
        confidence: { ...prev.confidence, kelurahan: 100 }
      }));

      // Auto fetch postal code
      const district = districts.find(d => d.id === parsedData.kecamatanId);
      if (district) {
        lookupPostalCode(village.name, district.name);
      } else {
        lookupPostalCode(village.name);
      }
    }
  };

  const handlePadInput = (field, value) => {
    if (value && /^\d+$/.test(value)) {
      setParsedData(prev => ({
        ...prev,
        [field]: value.padStart(3, '0')
      }));
    }
  };

  const getConfidenceColor = (score) => {
    if (!score) return 'bg-gray-100 border-gray-300';
    if (score >= 90) return 'bg-green-100 border-green-300';
    if (score >= 70) return 'bg-yellow-100 border-yellow-300';
    return 'bg-red-100 border-red-300';
  };

  const getConfidenceBadge = (score) => {
    if (!score) return null;
    if (score >= 90) return <CheckCircle className="w-4 h-4 text-green-600" />;
    return <AlertCircle className="w-4 h-4 text-yellow-600" />;
  };

  const handleSave = async () => {
    if (fullAddress.trim()) {
      const newEntry = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        timestampDisplay: new Date().toLocaleString('id-ID'),
        fullAddress,
        parsed: { ...parsedData }
      };

      try {
        await window.storage.set(`address:${newEntry.id}`, JSON.stringify(newEntry));
        setHistory([newEntry, ...history.slice(0, 9)]);
        alert('✓ Data alamat berhasil disimpan!');
      } catch (error) {
        setHistory([newEntry, ...history.slice(0, 9)]);
        alert('✓ Data alamat berhasil disimpan (sesi ini)');
      }
    }
  };

  const loadFromHistory = (entry) => {
    setFullAddress(entry.fullAddress);
    setParsedData(entry.parsed);

    // Reload related data
    if (entry.parsed.provinsiId) {
      loadRegencies(entry.parsed.provinsiId);
    }
    if (entry.parsed.kotaId) {
      loadDistricts(entry.parsed.kotaId);
    }
    if (entry.parsed.kecamatanId) {
      loadVillages(entry.parsed.kecamatanId);
    }

    setShowHistory(false);
  };

  const clearAll = () => {
    setFullAddress('');
    setParsedData({
      provinsi: '',
      provinsiId: '',
      kota: '',
      kotaId: '',
      kecamatan: '',
      kecamatanId: '',
      kelurahan: '',
      kelurahanId: '',
      kodePos: '',
      jalan: '',
      rt: '',
      rw: '',
      confidence: {}
    });
    setRegencies([]);
    setDistricts([]);
    setVillages([]);
    setApiStatus('');
  };

  const exportToCSV = () => {
    if (!parsedData.provinsi) {
      alert('Tidak ada data untuk di-export');
      return;
    }

    const csv = [
      ['Field', 'Value', 'Confidence'],
      ['Alamat Lengkap', fullAddress, ''],
      ['Provinsi', parsedData.provinsi, parsedData.confidence.provinsi || ''],
      ['Kota/Kabupaten', parsedData.kota, parsedData.confidence.kota || ''],
      ['Kecamatan', parsedData.kecamatan, parsedData.confidence.kecamatan || ''],
      ['Kelurahan/Desa', parsedData.kelurahan, parsedData.confidence.kelurahan || ''],
      ['Kode Pos', parsedData.kodePos, parsedData.confidence.kodePos || ''],
      ['Jalan/Nomor', parsedData.jalan, parsedData.confidence.jalan || ''],
      ['RT', parsedData.rt, parsedData.confidence.rt || ''],
      ['RW', parsedData.rw, parsedData.confidence.rw || '']
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `alamat_${Date.now()}.csv`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                Sistem Parsing Alamat Indonesia
              </h1>
              <p className="text-gray-600">
                Menggunakan API Real Data Wilayah Indonesia (38 Provinsi, Kota, Kecamatan, Kelurahan)
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={exportToCSV}
                disabled={!parsedData.provinsi}
                className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors disabled:opacity-50"
              >
                <Download className="w-5 h-5" />
                Export
              </button>
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors"
              >
                <Clock className="w-5 h-5" />
                Riwayat
              </button>
            </div>
          </div>

          {apiStatus && (
            <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-800 flex items-center gap-2">
              {isLoading && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              )}
              {apiStatus}
            </div>
          )}
        </div>

        {/* History Panel */}
        {showHistory && history.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h3 className="text-lg font-semibold mb-4">Riwayat Input ({history.length})</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  onClick={() => loadFromHistory(entry)}
                  className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
                >
                  <div className="text-sm text-gray-500">{entry.timestampDisplay}</div>
                  <div className="text-gray-800">{entry.fullAddress}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Example Addresses */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h3 className="text-lg font-semibold mb-3">Contoh Alamat:</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {[
              'Jl. Sudirman No. 123, Menteng, Jakarta Pusat, DKI Jakarta 10310',
              'Jl. Hj. Hanapi Gg. Cempaka RT/RW 010/002 No. 79 Pondok Bambu Duren Sawit Jakarta Timur DKI Jakarta',
              'Jl. Asia Afrika 100, Cicendo, Bandung, Jawa Barat'
            ].map((example, idx) => (
              <button
                key={idx}
                onClick={() => setFullAddress(example)}
                className="p-3 text-left text-sm bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
              >
                {example}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Section */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-800">Input Alamat Lengkap</h2>
              {fullAddress && (
                <button
                  onClick={clearAll}
                  className="flex items-center gap-1 px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear
                </button>
              )}
            </div>

            <textarea
              value={fullAddress}
              onChange={(e) => setFullAddress(e.target.value)}
              placeholder="Ketik atau paste alamat lengkap di sini..."
              className="w-full h-32 p-4 border-2 border-gray-300 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none resize-none"
            />

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Jalan/Nomor</label>
                <input
                  type="text"
                  value={parsedData.jalan}
                  onChange={(e) => setParsedData({ ...parsedData, jalan: e.target.value })}
                  className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-indigo-500 outline-none"
                  placeholder="Jl. Nama Jalan, No."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">RT</label>
                  <input
                    type="text"
                    value={parsedData.rt}
                    onChange={(e) => setParsedData({ ...parsedData, rt: e.target.value })}
                    onBlur={(e) => handlePadInput('rt', e.target.value)}
                    className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-indigo-500 outline-none"
                    placeholder="001"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">RW</label>
                  <input
                    type="text"
                    value={parsedData.rw}
                    onChange={(e) => setParsedData({ ...parsedData, rw: e.target.value })}
                    onBlur={(e) => handlePadInput('rw', e.target.value)}
                    className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-indigo-500 outline-none"
                    placeholder="002"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kode Pos</label>
                <input
                  type="text"
                  value={parsedData.kodePos}
                  onChange={(e) => setParsedData({ ...parsedData, kodePos: e.target.value })}
                  className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-indigo-500 outline-none"
                  placeholder="12345"
                  maxLength="5"
                />
              </div>
            </div>

            {isLoading && (
              <div className="mt-4 flex items-center gap-2 text-indigo-600">
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Menganalisis alamat dengan API...</span>
              </div>
            )}
          </div>

          {/* Parsed Output Section - Dropdowns */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              Hasil Parsing (Data Real dari API)
            </h2>

            <div className="space-y-4">
              {/* Provinsi */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Provinsi
                </label>
                <div className="relative">
                  <select
                    value={parsedData.provinsiId}
                    onChange={handleProvinceChange}
                    className={`w-full p-3 pr-10 border-2 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 appearance-none ${getConfidenceColor(parsedData.confidence.provinsi)
                      }`}
                  >
                    <option value="">Pilih Provinsi</option>
                    {provinces.map(prov => (
                      <option key={prov.id} value={prov.id}>{prov.name}</option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                    {getConfidenceBadge(parsedData.confidence.provinsi)}
                  </div>
                </div>
              </div>

              {/* Kota/Kabupaten */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kota/Kabupaten
                </label>
                <div className="relative">
                  <select
                    value={parsedData.kotaId}
                    onChange={handleRegencyChange}
                    disabled={!parsedData.provinsiId}
                    className={`w-full p-3 pr-10 border-2 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 appearance-none disabled:opacity-50 ${getConfidenceColor(parsedData.confidence.kota)
                      }`}
                  >
                    <option value="">Pilih Kota/Kabupaten</option>
                    {regencies.map(reg => (
                      <option key={reg.id} value={reg.id}>{reg.name}</option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                    {getConfidenceBadge(parsedData.confidence.kota)}
                  </div>
                </div>
              </div>

              {/* Kecamatan */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kecamatan
                </label>
                <div className="relative">
                  <select
                    value={parsedData.kecamatanId}
                    onChange={handleDistrictChange}
                    disabled={!parsedData.kotaId}
                    className={`w-full p-3 pr-10 border-2 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 appearance-none disabled:opacity-50 ${getConfidenceColor(parsedData.confidence.kecamatan)
                      }`}
                  >
                    <option value="">Pilih Kecamatan</option>
                    {districts.map(dist => (
                      <option key={dist.id} value={dist.id}>{dist.name}</option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                    {getConfidenceBadge(parsedData.confidence.kecamatan)}
                  </div>
                </div>
              </div>

              {/* Kelurahan/Desa */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kelurahan/Desa
                </label>
                <div className="relative">
                  <select
                    value={parsedData.kelurahanId}
                    onChange={handleVillageChange}
                    disabled={!parsedData.kecamatanId}
                    className={`w-full p-3 pr-10 border-2 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 appearance-none disabled:opacity-50 ${getConfidenceColor(parsedData.confidence.kelurahan)
                      }`}
                  >
                    <option value="">Pilih Kelurahan/Desa</option>
                    {villages.map(vill => (
                      <option key={vill.id} value={vill.id}>{vill.name}</option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                    {getConfidenceBadge(parsedData.confidence.kelurahan)}
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={!parsedData.provinsi}
              className="w-full mt-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Simpan Data Alamat
            </button>
          </div>
        </div>

        {/* Info Footer */}
        <div className="mt-6 bg-white rounded-lg shadow-lg p-4">
          <div className="flex items-start gap-3 text-sm text-gray-600">
            <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Data Real dari API:</strong> Aplikasi ini menggunakan API wilayah Indonesia resmi dengan data lengkap 38 provinsi, 514 kota/kabupaten, ribuan kecamatan dan kelurahan.
              Auto-parsing akan mencocokkan teks alamat dengan database real. Anda juga bisa memilih manual dari dropdown untuk akurasi 100%.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddressParserRealAPI;