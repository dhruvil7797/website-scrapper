import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Campaign, Niche } from '@/types';

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [niches, setNiches] = useState<Niche[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', niche_id: '', location: '', country: 'US', requested_count: 50 });

  useEffect(() => {
    api.get<Campaign[]>('/campaigns').then(setCampaigns).catch(console.error);
    api.get<Niche[]>('/niches').then(setNiches).catch(console.error);
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

  const handleDiscover = async (campaignId: string) => {
    setRunning(campaignId);
    try {
      const result = await api.post<{ discovered: number }>('/discover', { campaign_id: campaignId });
      setCampaigns(campaigns.map(c =>
        c.id === campaignId ? { ...c, discovered_count: c.discovered_count + result.discovered, status: 'completed' } : c
      ));
    } catch (err) {
      console.error(err);
    }
    setRunning(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Campaigns</h1>
        <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700">
          + New Campaign
        </button>
      </div>

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
              <select
                value={form.niche_id}
                onChange={e => setForm({ ...form, niche_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select niche...</option>
                {Object.entries(nichesByCategory).map(([cat, items]) => (
                  <optgroup key={cat} label={cat}>
                    {items.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                  </optgroup>
                ))}
              </select>
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
                <td className="px-4 py-3 text-center">{c.discovered_count}/{c.requested_count}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    c.status === 'completed' ? 'bg-green-100 text-green-700'
                    : c.status === 'running' ? 'bg-blue-100 text-blue-700'
                    : c.status === 'failed' ? 'bg-red-100 text-red-700'
                    : 'bg-gray-100 text-gray-600'
                  }`}>{c.status}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  {(c.status === 'pending' || c.status === 'completed') && (
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
