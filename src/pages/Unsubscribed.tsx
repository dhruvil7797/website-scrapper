import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface UnsubscribedProspect {
  id: string;
  business_name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  state_province: string | null;
  niche_name: string | null;
  campaign_id: string | null;
  updated_at: string;
  last_emailed_at: string | null;
  email_count: number;
}

export default function Unsubscribed() {
  const [prospects, setProspects] = useState<UnsubscribedProspect[]>([]);
  const [loading, setLoading] = useState(true);
  const [resubscribing, setResubscribing] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.get<UnsubscribedProspect[]>('/unsubscribed')
      .then(setProspects)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleResubscribe = async (id: string, name: string) => {
    if (!confirm(`Re-subscribe "${name}"? They will be eligible for emails again.`)) return;
    setResubscribing(id);
    try {
      await api.post('/unsubscribed', { prospect_id: id });
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to re-subscribe');
    }
    setResubscribing(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Unsubscribed</h1>
          <p className="text-sm text-gray-500 mt-1">Prospects who clicked the unsubscribe link. Emails are blocked for these contacts.</p>
        </div>
        <div className="text-sm text-gray-500">
          {prospects.length} opted out
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Business</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Location</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Niche</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Emails Sent</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Opted Out</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
            ) : prospects.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                <p className="text-lg mb-2">🎉 No one has unsubscribed</p>
                <p className="text-sm">When a prospect clicks the unsubscribe link in your emails, they'll appear here.</p>
              </td></tr>
            ) : prospects.map(p => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{p.business_name}</td>
                <td className="px-4 py-3 text-gray-600">{p.email || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{p.city}{p.state_province ? `, ${p.state_province}` : ''}</td>
                <td className="px-4 py-3 text-gray-600">{p.niche_name || '—'}</td>
                <td className="px-4 py-3 text-center text-gray-600">{p.email_count}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{new Date(p.updated_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleResubscribe(p.id, p.business_name)}
                    disabled={resubscribing === p.id}
                    className="text-xs px-2.5 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100 disabled:opacity-50"
                  >
                    {resubscribing === p.id ? '⏳...' : '↩️ Re-subscribe'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {prospects.length > 0 && (
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
          <strong>⚠️ Legal note:</strong> Re-subscribing a prospect only removes the block in this system.
          Under CASL/CAN-SPAM, you should only re-subscribe someone who has explicitly given you permission to email them again.
        </div>
      )}
    </div>
  );
}
