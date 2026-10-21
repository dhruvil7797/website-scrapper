import { useEffect, useState, useRef } from 'react';
import { api } from '@/lib/api';
import type { Campaign, Niche, Prospect } from '@/types';

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [niches, setNiches] = useState<Niche[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [discoveryResult, setDiscoveryResult] = useState<{ campaignId: string; total: number; hot: number; skipped: number; duplicates: number } | null>(null);
  const [form, setForm] = useState({ name: '', niche_id: '', location: '', country: 'US', requested_count: 50 });
  const [showAddNiche, setShowAddNiche] = useState(false);
  const [nicheForm, setNicheForm] = useState({ name: '', category: '', search_terms: '' });
  const [hotLeadCounts, setHotLeadCounts] = useState<Record<string, number>>({});
  const [nicheSearch, setNicheSearch] = useState('');
  const [nicheDropdownOpen, setNicheDropdownOpen] = useState(false);
  const nicheDropdownRef = useRef<HTMLDivElement>(null);

  const loadNiches = () => api.get<Niche[]>('/niches').then(setNiches).catch(console.error);

  // Close niche dropdown on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (nicheDropdownRef.current && !nicheDropdownRef.current.contains(e.target as Node)) {
        setNicheDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const loadHotLeadCounts = (campaignList: Campaign[]) => {
    campaignList.forEach(c => {
      if (c.discovered_count > 0) {
        api.get<Prospect[]>(`/prospects?campaign_id=${c.id}`).then(prospects => {
          const hot = prospects.filter(p => {
            const tier = p.tier || (p.quality_score >= 60 ? 'hot' : p.quality_score >= 30 ? 'warm' : 'cold');
            return tier === 'hot';
          }).length;
          setHotLeadCounts(prev => ({ ...prev, [c.id]: hot }));
        }).catch(() => {});
      }
    });
  };

  useEffect(() => {
    api.get<Campaign[]>('/campaigns').then(data => {
      setCampaigns(data);
      loadHotLeadCounts(data);
    }).catch(console.error);
    loadNiches();
  }, []);

  const nichesByCategory = niches.reduce<Record<string, Niche[]>>((acc, n) => {
    (acc[n.category] ??= []).push(n);
    return acc;
  }, {});

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const campaign = await api.post<Campaign>('/campaigns', form);
    setCampaigns([campaign, ...campaigns]);
    setShowForm(false);
    setForm({ name: '', niche_id: '', location: '', country: 'US', requested_count: 50 });
  };

  const handleAddNiche = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nicheForm.name || !nicheForm.category) return;
    await api.post('/niches/manage', nicheForm);
    setShowAddNiche(false);
    setNicheForm({ name: '', category: '', search_terms: '' });
    loadNiches();
  };

  const handleDiscover = async (campaignId: string) => {
    setRunning(campaignId);
    setDiscoveryResult(null);
    try {
      const result = await api.post<{ discovered: number; hot_leads?: number; skipped_chains?: number; duplicates?: number }>('/discover', { campaign_id: campaignId });

      // Fetch prospects for this campaign to compute tier counts
      let hotCount = 0;
      let skipCount = result.skipped_chains || 0;
      let dupeCount = result.duplicates || 0;
      try {
        const prospects = await api.get<Prospect[]>(`/prospects?campaign_id=${campaignId}`);
        hotCount = result.hot_leads ?? prospects.filter(p => {
          const tier = p.tier || (p.quality_score >= 60 ? 'hot' : p.quality_score >= 30 ? 'warm' : 'cold');
          return tier === 'hot';
        }).length;
      } catch {
        hotCount = result.hot_leads || 0;
      }

      setDiscoveryResult({
        campaignId,
        total: result.discovered,
        hot: hotCount,
        skipped: skipCount,
        duplicates: dupeCount,
      });

      setCampaigns(campaigns.map(c =>
        c.id === campaignId ? { ...c, discovered_count: c.discovered_count + result.discovered, status: 'completed' } : c
      ));

      setHotLeadCounts(prev => ({ ...prev, [campaignId]: (prev[campaignId] || 0) + hotCount }));
    } catch (err) {
      console.error(err);
    }
    setRunning(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Campaigns</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowAddNiche(!showAddNiche)} className="border border-gray-300 text-gray-700 px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-50">
            + Add Niche
          </button>
          <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700">
            + New Campaign
          </button>
        </div>
      </div>

      {/* Discovery result banner */}
      {discoveryResult && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-green-800">
              ✅ Discovered {discoveryResult.total} prospects
              <span className="ml-2">
                ({discoveryResult.hot > 0 && <span className="text-orange-600 font-semibold">🔥 {discoveryResult.hot} hot leads</span>}
                {discoveryResult.skipped > 0 && <span className="text-gray-500">, {discoveryResult.skipped} skipped chains</span>}
                {discoveryResult.duplicates > 0 && <span className="text-gray-500">, {discoveryResult.duplicates} duplicates</span>})
              </span>
            </p>
          </div>
          <button onClick={() => setDiscoveryResult(null)} className="text-green-600 hover:text-green-800 text-sm">✕</button>
        </div>
      )}

      {showAddNiche && (
        <form onSubmit={handleAddNiche} className="bg-white rounded-lg border border-purple-200 p-4 mb-6 space-y-3">
          <h3 className="text-sm font-medium text-gray-900">Add New Niche Category</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Name *</label>
              <input value={nicheForm.name} onChange={e => setNicheForm({ ...nicheForm, name: e.target.value })} placeholder="Immigration Agency" className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" required />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Category *</label>
              <input value={nicheForm.category} onChange={e => setNicheForm({ ...nicheForm, category: e.target.value })} placeholder="Professional" className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" list="niche-categories" required />
              <datalist id="niche-categories">
                {[...new Set(niches.map(n => n.category))].sort().map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Search Terms (comma-separated)</label>
              <input value={nicheForm.search_terms} onChange={e => setNicheForm({ ...nicheForm, search_terms: e.target.value })} placeholder="immigration consultant, visa agent" className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="bg-purple-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-purple-700">Add Niche</button>
            <button type="button" onClick={() => setShowAddNiche(false)} className="text-gray-500 px-3 py-1.5 text-sm">Cancel</button>
          </div>
          <p className="text-xs text-gray-400">Current count: {niches.length} niches. Category will auto-suggest from existing ones.</p>
        </form>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-lg border border-gray-200 p-5 mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Name</label>
              <input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Austin Plumbers Q3"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Niche</label>
              <div className="relative" ref={nicheDropdownRef}>
                <input
                  type="text"
                  value={nicheSearch || (form.niche_id ? niches.find(n => n.id === form.niche_id)?.name || '' : '')}
                  onChange={e => { setNicheSearch(e.target.value); setNicheDropdownOpen(true); if (!e.target.value) setForm({ ...form, niche_id: '' }); }}
                  onFocus={() => setNicheDropdownOpen(true)}
                  placeholder="Search niches... (75+ available)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required={!form.niche_id}
                />
                {form.niche_id && (
                  <button type="button" onClick={() => { setForm({ ...form, niche_id: '' }); setNicheSearch(''); }} className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600 text-xs">✕</button>
                )}
                {nicheDropdownOpen && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {Object.entries(nichesByCategory)
                      .map(([cat, items]) => {
                        const filtered = items.filter(n => !nicheSearch || n.name.toLowerCase().includes(nicheSearch.toLowerCase()) || cat.toLowerCase().includes(nicheSearch.toLowerCase()));
                        if (filtered.length === 0) return null;
                        return (
                          <div key={cat}>
                            <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50 sticky top-0">{cat} ({filtered.length})</div>
                            {filtered.map(n => (
                              <button
                                key={n.id}
                                type="button"
                                onClick={() => { setForm({ ...form, niche_id: n.id }); setNicheSearch(''); setNicheDropdownOpen(false); }}
                                className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${form.niche_id === n.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}`}
                              >
                                {n.name}
                              </button>
                            ))}
                          </div>
                        );
                      })
                      .filter(Boolean)}
                    {niches.filter(n => !nicheSearch || n.name.toLowerCase().includes(nicheSearch.toLowerCase())).length === 0 && (
                      <div className="px-3 py-4 text-sm text-gray-400 text-center">No niches match "{nicheSearch}"</div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <input
                value={form.location}
                onChange={e => setForm({ ...form, location: e.target.value })}
                placeholder="Austin, TX"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Count</label>
              <input
                type="number"
                value={form.requested_count}
                onChange={e => setForm({ ...form, requested_count: Number(e.target.value) })}
                min={5} max={100}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700">Create</button>
            <button type="button" onClick={() => setShowForm(false)} className="text-gray-500 px-4 py-2 text-sm">Cancel</button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Niche</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Location</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Found</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {campaigns.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No campaigns yet. Create one to start discovering prospects.</td></tr>
            ) : campaigns.map(c => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                <td className="px-4 py-3 text-gray-600">{c.niche_name || c.niche_id}</td>
                <td className="px-4 py-3 text-gray-600">{c.location}</td>
                <td className="px-4 py-3 text-center">
                  <span>{c.discovered_count}/{c.requested_count}</span>
                  {hotLeadCounts[c.id] > 0 && (
                    <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                      🔥 {hotLeadCounts[c.id]}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    c.status === 'completed' ? 'bg-green-100 text-green-700'
                    : c.status === 'running' ? 'bg-blue-100 text-blue-700'
                    : c.status === 'failed' ? 'bg-red-100 text-red-700'
                    : 'bg-gray-100 text-gray-600'
                  }`}>{c.status}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  {(c.status === 'pending' || c.status === 'completed' || c.status === 'failed') && (
                    <button
                      onClick={() => handleDiscover(c.id)}
                      disabled={running === c.id}
                      className="text-blue-600 hover:text-blue-700 text-sm font-medium disabled:opacity-50"
                    >
                      {running === c.id ? 'Discovering...' : 'Run Discovery'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
