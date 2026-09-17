import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import type { Prospect, Niche, Campaign, EmailLogEntry, SmsLogEntry } from '@/types';

interface EditForm {
  business_name: string; phone: string; email: string; website_url: string;
  owner_name: string; address: string; city: string; state_province: string;
  postal_code: string; notes: string; niche_id: string; campaign_id: string;
}

const emptyForm: EditForm = { business_name: '', phone: '', email: '', website_url: '', owner_name: '', address: '', city: '', state_province: '', postal_code: '', notes: '', niche_id: '', campaign_id: '' };

export default function Prospects() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [niches, setNiches] = useState<Niche[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [filters, setFilters] = useState({ status: '', niche_id: '', campaign_id: '', min_score: 0, q: '' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Prospect | null>(null);
  const [emailHistory, setEmailHistory] = useState<EmailLogEntry[]>([]);
  const [smsHistory, setSmsHistory] = useState<SmsLogEntry[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingProspect, setEditingProspect] = useState<EditForm | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pageSpeedData, setPageSpeedData] = useState<{ score: number; fcp: string | null; lcp: string | null; cls: string | null; tbt: string | null; si: string | null; issues: string[]; report_url?: string } | null>(null);
  const [pageSpeedUrl, setPageSpeedUrl] = useState('');

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.niche_id) params.set('niche_id', filters.niche_id);
    if (filters.campaign_id) params.set('campaign_id', filters.campaign_id);
    if (filters.min_score) params.set('min_score', String(filters.min_score));
    if (filters.q) params.set('q', filters.q);
    api.get<Prospect[]>(`/prospects?${params}`).then(setProspects).catch(console.error);
  }, [filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get<Niche[]>('/niches').then(setNiches).catch(console.error); }, []);
  useEffect(() => { api.get<Campaign[]>('/campaigns').then(setCampaigns).catch(console.error); }, []);

  const loadEmailHistory = (id: string) => {
    api.get<EmailLogEntry[]>(`/prospects/${id}/emails`).then(setEmailHistory).catch(() => setEmailHistory([]));
    api.get<SmsLogEntry[]>(`/prospects/${id}/sms`).then(setSmsHistory).catch(() => setSmsHistory([]));
  };

  const selectDetail = (p: Prospect) => {
    setDetail(p);
    setPageSpeedUrl('');
    // Load stored PageSpeed data if available
    if (p.pagespeed_mobile && p.pagespeed_data) {
      try { setPageSpeedData(JSON.parse(p.pagespeed_data)); } catch { setPageSpeedData(null); }
    } else {
      setPageSpeedData(null);
    }
    loadEmailHistory(p.id);
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const bulkAction = async (action: 'skip' | 'delete') => {
    if (!selected.size || (action === 'delete' && !confirm(`Delete ${selected.size} prospects?`))) return;
    await api.post('/prospects/bulk', { ids: [...selected], action });
    setSelected(new Set());
    setDetail(null);
    load();
  };

  const updateStatus = async (id: string, status: string) => {
    const result = await api.patch<Prospect>(`/prospects/${id}`, { status });
    load();
    if (detail?.id === id) setDetail(result);
  };

  const deleteProspect = async (id: string) => {
    if (!confirm('Delete this prospect?')) return;
    await api.delete(`/prospects/${id}`);
    if (detail?.id === id) setDetail(null);
    load();
  };

  const scrapeEmail = async (id: string) => {
    setActionLoading('scrape_' + id);
    try {
      const result = await api.post<{ email: string | null; all_found: string[] }>('/scrape-email', { prospect_id: id });
      if (result.email) {
        alert(`Found: ${result.email}${result.all_found.length > 1 ? ` (+ ${result.all_found.length - 1} more)` : ''}`);
      } else {
        alert('No email found on their website');
      }
      load();
      if (detail?.id === id) {
        const updated = await api.get<Prospect>(`/prospects/${id}`);
        setDetail(updated);
      }
    } catch (e) { alert(e instanceof Error ? e.message : 'Scrape failed'); }
    setActionLoading(null);
  };

  const pullPageSpeed = async (id: string) => {
    if (!pageSpeedUrl.includes('pagespeed.web.dev')) { alert('Paste a pagespeed.web.dev report URL'); return; }
    setActionLoading('speed_' + id);
    try {
      const result = await api.post<{ score: number; fcp: string | null; lcp: string | null; cls: string | null; tbt: string | null; si: string | null; issues: string[]; report_url: string }>('/pagespeed', { prospect_id: id, report_url: pageSpeedUrl });
      setPageSpeedData(result);
      setPageSpeedUrl('');
      load();
      if (detail?.id === id) {
        const updated = await api.get<Prospect>(`/prospects/${id}`);
        setDetail(updated);
      }
    } catch (e) { alert(e instanceof Error ? e.message : 'Pull failed — make sure the report has finished loading on pagespeed.web.dev'); }
    setActionLoading(null);
  };

  const handleAddProspect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProspect) return;
    await api.post('/prospects', editingProspect);
    setShowAddForm(false);
    setEditingProspect(null);
    load();
  };

  const handleEditProspect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProspect || !editingId) return;
    await api.patch(`/prospects/${editingId}`, editingProspect);
    setEditingId(null);
    setEditingProspect(null);
    load();
    if (detail?.id === editingId) {
      const updated = await api.get<Prospect>(`/prospects/${editingId}`);
      setDetail(updated);
    }
  };

  const startEdit = (p: Prospect) => {
    setEditingId(p.id);
    setEditingProspect({
      business_name: p.business_name, phone: p.phone || '', email: p.email || '',
      website_url: p.website_url || '', owner_name: p.owner_name || '',
      address: p.address || '', city: p.city || '', state_province: p.state_province || '',
      postal_code: p.postal_code || '', notes: p.notes || '',
      niche_id: p.niche_id || '', campaign_id: p.campaign_id || '',
    });
  };

  const scoreColor = (s: number) => s >= 60 ? 'text-green-600' : s >= 30 ? 'text-yellow-600' : 'text-red-500';

  const formFields: { key: string; label: string; required?: boolean }[] = [
    { key: 'business_name', label: 'Business Name*', required: true },
    { key: 'owner_name', label: 'Owner Name' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'website_url', label: 'Website URL' },
    { key: 'city', label: 'City' },
    { key: 'state_province', label: 'State/Province' },
    { key: 'postal_code', label: 'Postal Code' },
    { key: 'address', label: 'Address' },
  ];

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold text-gray-900">Prospects</h1>
          <div className="flex gap-2">
            {selected.size > 0 && (
              <>
                <button onClick={() => bulkAction('skip')} className="text-sm px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50">Skip ({selected.size})</button>
                <button onClick={() => bulkAction('delete')} className="text-sm px-3 py-1.5 border border-red-300 text-red-600 rounded-md hover:bg-red-50">Delete ({selected.size})</button>
              </>
            )}
            <button onClick={() => { setShowAddForm(true); setEditingProspect({ ...emptyForm }); }} className="bg-blue-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-blue-700">+ Add Prospect</button>
          </div>
        </div>

        {/* Add form */}
        {showAddForm && editingProspect && (
          <form onSubmit={handleAddProspect} className="bg-white rounded-lg border border-gray-200 p-5 mb-6 space-y-3">
            <h3 className="font-medium text-gray-900">Add Prospect</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {formFields.map(f => (
                <div key={f.key}>
                  <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
                  <input value={(editingProspect as unknown as Record<string, string>)[f.key] || ''} onChange={e => setEditingProspect({ ...editingProspect, [f.key]: e.target.value })} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" required={f.required} />
                </div>
              ))}
              <div><label className="block text-xs text-gray-500 mb-1">Niche</label><select value={editingProspect.niche_id} onChange={e => setEditingProspect({ ...editingProspect, niche_id: e.target.value })} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"><option value="">None</option>{niches.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select></div>
              <div><label className="block text-xs text-gray-500 mb-1">Campaign</label><select value={editingProspect.campaign_id} onChange={e => setEditingProspect({ ...editingProspect, campaign_id: e.target.value })} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"><option value="">None</option>{campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            </div>
            <div><label className="block text-xs text-gray-500 mb-1">Notes</label><textarea value={editingProspect.notes} onChange={e => setEditingProspect({ ...editingProspect, notes: e.target.value })} rows={2} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" /></div>
            <div className="flex gap-2">
              <button type="submit" className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-blue-700">Add</button>
              <button type="button" onClick={() => { setShowAddForm(false); setEditingProspect(null); }} className="text-gray-500 px-3 py-1.5 text-sm">Cancel</button>
            </div>
          </form>
        )}

        {/* Edit form */}
        {editingId && editingProspect && (
          <form onSubmit={handleEditProspect} className="bg-white rounded-lg border border-gray-200 p-5 mb-6 space-y-3">
            <h3 className="font-medium text-gray-900">Edit Prospect</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {formFields.map(f => (
                <div key={f.key}>
                  <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
                  <input value={(editingProspect as unknown as Record<string, string>)[f.key] || ''} onChange={e => setEditingProspect({ ...editingProspect, [f.key]: e.target.value })} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" required={f.required} />
                </div>
              ))}
              <div><label className="block text-xs text-gray-500 mb-1">Niche</label><select value={editingProspect.niche_id} onChange={e => setEditingProspect({ ...editingProspect, niche_id: e.target.value })} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"><option value="">None</option>{niches.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select></div>
            </div>
            <div><label className="block text-xs text-gray-500 mb-1">Notes</label><textarea value={editingProspect.notes} onChange={e => setEditingProspect({ ...editingProspect, notes: e.target.value })} rows={2} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" /></div>
            <div className="flex gap-2">
              <button type="submit" className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-blue-700">Save</button>
              <button type="button" onClick={() => { setEditingId(null); setEditingProspect(null); }} className="text-gray-500 px-3 py-1.5 text-sm">Cancel</button>
            </div>
          </form>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          <input
            placeholder="🔍 Search business name..."
            value={filters.q}
            onChange={e => setFilters({ ...filters, q: e.target.value })}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm w-48"
          />
          <select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })} className="px-3 py-1.5 border border-gray-300 rounded-md text-sm">
            <option value="">All statuses</option>
            {['new', 'contacted', 'replied', 'won', 'lost', 'skipped'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filters.niche_id} onChange={e => setFilters({ ...filters, niche_id: e.target.value })} className="px-3 py-1.5 border border-gray-300 rounded-md text-sm">
            <option value="">All niches</option>
            {niches.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
          <select value={filters.campaign_id} onChange={e => setFilters({ ...filters, campaign_id: e.target.value })} className="px-3 py-1.5 border border-gray-300 rounded-md text-sm">
            <option value="">All campaigns</option>
            {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input type="number" placeholder="Min score" min={0} max={100} value={filters.min_score || ''} onChange={e => setFilters({ ...filters, min_score: Number(e.target.value) || 0 })} className="px-3 py-1.5 border border-gray-300 rounded-md text-sm w-24" />
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="w-8 px-3 py-3"><input type="checkbox" onChange={e => setSelected(e.target.checked ? new Set(prospects.map(p => p.id)) : new Set())} /></th>
                <th className="text-left px-3 py-3 font-medium text-gray-600">Business</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600">City</th>
                <th className="text-center px-3 py-3 font-medium text-gray-600">Score</th>
                <th className="text-center px-3 py-3 font-medium text-gray-600">Web</th>
                <th className="text-center px-3 py-3 font-medium text-gray-600">Email</th>
                <th className="text-center px-3 py-3 font-medium text-gray-600">Status</th>
                <th className="text-right px-3 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {prospects.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No prospects found.</td></tr>
              ) : prospects.map(p => (
                <tr key={p.id} className={`hover:bg-gray-50 cursor-pointer ${detail?.id === p.id ? 'bg-blue-50' : ''}`} onClick={() => selectDetail(p)}>
                  <td className="px-3 py-3" onClick={e => e.stopPropagation()}><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} /></td>
                  <td className="px-3 py-3"><p className="font-medium text-gray-900 truncate max-w-[200px]">{p.business_name}</p><p className="text-xs text-gray-400">{p.niche_name || p.niche_id}</p></td>
                  <td className="px-3 py-3 text-gray-600">{p.city}{p.state_province ? `, ${p.state_province}` : ''}</td>
                  <td className={`px-3 py-3 text-center font-semibold ${scoreColor(p.quality_score)}`}>{p.quality_score}</td>
                  <td className="px-3 py-3 text-center">{p.has_website ? '🌐' : '❌'}</td>
                  <td className="px-3 py-3 text-center">{p.email ? '✅' : '—'}</td>
                  <td className="px-3 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.status === 'new' ? 'bg-blue-100 text-blue-700' : p.status === 'contacted' ? 'bg-yellow-100 text-yellow-700' : p.status === 'replied' ? 'bg-green-100 text-green-700' : p.status === 'won' ? 'bg-green-200 text-green-800' : p.status === 'lost' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'}`}>{p.status}</span>
                  </td>
                  <td className="px-3 py-3 text-right space-x-1" onClick={e => e.stopPropagation()}>
                    <Link to={`/compose/${p.id}?mode=email`} className="text-blue-600 hover:text-blue-700 text-xs">✉️</Link>
                    <Link to={`/compose/${p.id}?mode=sms`} className="text-green-600 hover:text-green-700 text-xs">📱</Link>
                    <button onClick={() => startEdit(p)} className="text-gray-400 hover:text-gray-600 text-xs">✏️</button>
                    <button onClick={() => deleteProspect(p.id)} className="text-red-400 hover:text-red-600 text-xs">🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-2">{prospects.length} prospects shown</p>
      </div>

      {/* Detail panel */}
      {detail && (
        <div className="w-80 flex-shrink-0 bg-white rounded-lg border border-gray-200 p-5 sticky top-6 space-y-4 max-h-[calc(100vh-6rem)] overflow-y-auto">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 text-lg leading-tight">{detail.business_name}</h2>
            <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600">✕</button>
          </div>

          <div className="space-y-2 text-sm">
            <div><span className="text-gray-500">Score:</span> <span className={`font-semibold ${scoreColor(detail.quality_score)}`}>{detail.quality_score}/100</span></div>
            {detail.phone && <div><span className="text-gray-500">Phone:</span> <a href={`tel:${detail.phone}`} className="text-blue-600">{detail.phone}</a></div>}
            {detail.email && <div><span className="text-gray-500">Email:</span> <a href={`mailto:${detail.email}`} className="text-blue-600 break-all">{detail.email}</a></div>}
            {detail.website_url && <div><span className="text-gray-500">Website:</span> <a href={detail.website_url} target="_blank" rel="noopener" className="text-blue-600 truncate block">{detail.website_url}</a></div>}
            {detail.address && <div><span className="text-gray-500">Address:</span> {detail.address}</div>}
            {detail.google_rating && <div><span className="text-gray-500">Rating:</span> {detail.google_rating}⭐ ({detail.google_review_count} reviews)</div>}
            {detail.pagespeed_mobile != null && <div><span className="text-gray-500">PageSpeed:</span> {detail.pagespeed_mobile}/100</div>}
            {detail.owner_name && <div><span className="text-gray-500">Owner:</span> {detail.owner_name}</div>}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-1.5">
            {detail.website_url && !detail.email && (
              <button onClick={() => scrapeEmail(detail.id)} disabled={actionLoading === 'scrape_' + detail.id} className="text-xs px-2 py-1 bg-purple-50 text-purple-700 rounded hover:bg-purple-100 disabled:opacity-50">
                {actionLoading === 'scrape_' + detail.id ? '⏳ Scraping...' : '📧 Find Email'}
              </button>
            )}
            {detail.website_url && (
              <a href={`https://pagespeed.web.dev/analysis/${encodeURIComponent(detail.website_url)}?form_factor=mobile`} target="_blank" rel="noopener" className="text-xs px-2 py-1 bg-orange-50 text-orange-700 rounded hover:bg-orange-100 inline-block">
                ⚡ PageSpeed Report
              </a>
            )}
            {detail.website_url && (
              <button onClick={() => pullPageSpeed(detail.id)} disabled={actionLoading === 'speed_' + detail.id} className="text-xs px-2 py-1 bg-yellow-50 text-yellow-700 rounded hover:bg-yellow-100 disabled:opacity-50">
                {actionLoading === 'speed_' + detail.id ? '⏳ Pulling...' : '📊 Pull Speed Data'}
              </button>
            )}
            {detail.website_url && (
              <a href={detail.website_url} target="_blank" rel="noopener" className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 inline-block">
                🌐 Visit Site
              </a>
            )}
            <button onClick={() => startEdit(detail)} className="text-xs px-2 py-1 bg-gray-50 text-gray-700 rounded hover:bg-gray-100">✏️ Edit</button>
            <button onClick={() => deleteProspect(detail.id)} className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100">🗑️ Delete</button>
          </div>

          {/* PageSpeed URL input */}
          {detail.website_url && (
            <div className="flex gap-1">
              <input
                value={pageSpeedUrl}
                onChange={e => setPageSpeedUrl(e.target.value)}
                placeholder="Paste pagespeed.web.dev URL..."
                className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs"
              />
              <button onClick={() => pullPageSpeed(detail.id)} disabled={!pageSpeedUrl || actionLoading === 'speed_' + detail.id} className="px-2 py-1 bg-yellow-50 text-yellow-700 rounded text-xs hover:bg-yellow-100 disabled:opacity-50 whitespace-nowrap">
                {actionLoading === 'speed_' + detail.id ? '⏳' : '📊 Pull'}
              </button>
            </div>
          )}

          {/* PageSpeed details */}
          {pageSpeedData && (
            <div className="border border-orange-200 rounded-md p-3 bg-orange-50">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-orange-800">PageSpeed: {pageSpeedData.score}/100</p>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${pageSpeedData.score >= 90 ? 'bg-green-500' : pageSpeedData.score >= 50 ? 'bg-orange-500' : 'bg-red-500'}`}>
                  {pageSpeedData.score}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs mb-2">
                {pageSpeedData.fcp && <div><span className="text-gray-500">FCP:</span> {pageSpeedData.fcp}</div>}
                {pageSpeedData.lcp && <div><span className="text-gray-500">LCP:</span> {pageSpeedData.lcp}</div>}
                {pageSpeedData.tbt && <div><span className="text-gray-500">TBT:</span> {pageSpeedData.tbt}</div>}
                {pageSpeedData.cls && <div><span className="text-gray-500">CLS:</span> {pageSpeedData.cls}</div>}
              </div>
              {pageSpeedData.issues.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-orange-800 mb-1">Issues found:</p>
                  <ul className="text-xs text-gray-600 space-y-0.5">
                    {pageSpeedData.issues.map((issue, i) => <li key={i}>• {issue}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-xs text-gray-500">Notes</label>
            <textarea
              value={detail.notes || ''}
              onChange={e => setDetail({ ...detail, notes: e.target.value })}
              onBlur={() => detail.notes !== null && api.patch(`/prospects/${detail.id}`, { notes: detail.notes })}
              rows={3}
              className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm"
              placeholder="Add notes..."
            />
          </div>

          {/* Score breakdown */}
          {detail.score_breakdown && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Score Breakdown</p>
              <div className="space-y-0.5">
                {Object.entries(JSON.parse(detail.score_breakdown)).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs">
                    <span className="text-gray-500">{k.replace(/_/g, ' ')}</span>
                    <span className={Number(v) >= 0 ? 'text-green-600' : 'text-red-500'}>{Number(v) > 0 ? '+' : ''}{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Status change */}
          <div>
            <select value={detail.status} onChange={e => updateStatus(detail.id, e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm">
              {['new', 'contacted', 'replied', 'won', 'lost', 'skipped'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {detail.email && (
            <Link to={`/compose/${detail.id}?mode=email`} className="block w-full text-center bg-blue-600 text-white py-2 rounded text-sm font-medium hover:bg-blue-700">
              ✉️ Compose Email
            </Link>
          )}

          <div className="flex gap-2">
            <Link to={`/compose/${detail.id}?mode=email`} className="flex-1 text-center bg-blue-50 text-blue-700 py-1.5 rounded text-xs font-medium hover:bg-blue-100">✉️ Email</Link>
            <Link to={`/compose/${detail.id}?mode=sms`} className="flex-1 text-center bg-green-50 text-green-700 py-1.5 rounded text-xs font-medium hover:bg-green-100">📱 SMS</Link>
          </div>

          {/* Email history */}
          {emailHistory.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Email History</p>
              <div className="space-y-2">
                {emailHistory.map(e => (
                  <div key={e.id} className="text-xs border border-gray-100 rounded p-2">
                    <div className="flex justify-between">
                      <span className="font-medium truncate">{e.subject}</span>
                      <span className={e.status === 'sent' ? 'text-green-600' : 'text-red-500'}>{e.status}</span>
                    </div>
                    <p className="text-gray-400 mt-0.5">{new Date(e.sent_at).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SMS history */}
          {smsHistory.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1">SMS History</p>
              <div className="space-y-2">
                {smsHistory.map(s => (
                  <div key={s.id} className="text-xs border border-green-100 rounded p-2">
                    <div className="flex justify-between">
                      <span className="font-medium truncate">📱 {s.to_phone}</span>
                      <span className={s.status === 'sent' ? 'text-green-600' : 'text-red-500'}>{s.status}</span>
                    </div>
                    <p className="text-gray-500 mt-0.5 truncate">{s.body.substring(0, 80)}...</p>
                    <p className="text-gray-400 mt-0.5">{new Date(s.sent_at).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
