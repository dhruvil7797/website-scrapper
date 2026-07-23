import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Pause, Play } from 'lucide-react';
import api, { Campaign } from '../lib/api';
import CampaignForm from '../components/CampaignForm';

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);

  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const data = await api.getCampaigns();
      setCampaigns(Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const handleCreate = async (data: Partial<Campaign>) => {
    await api.createCampaign(data);
    setShowForm(false);
    fetchCampaigns();
  };

  const handleUpdate = async (data: Partial<Campaign>) => {
    if (!editingCampaign) return;
    await api.updateCampaign(editingCampaign.id, data);
    setEditingCampaign(null);
    fetchCampaigns();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this campaign?')) return;
    await api.deleteCampaign(id);
    fetchCampaigns();
  };

  const handleToggle = async (campaign: Campaign) => {
    await api.updateCampaign(campaign.id, { status: campaign.status === 'active' ? 'paused' : 'active' });
    fetchCampaigns();
  };

  if (showForm || editingCampaign) {
    return (
      <div className="max-w-xl">
        <h2 className="text-2xl font-bold text-slate-900 mb-6">
          {editingCampaign ? 'Edit Campaign' : 'New Campaign'}
        </h2>
        <div className="card p-6">
          <CampaignForm
            campaign={editingCampaign}
            onSubmit={editingCampaign ? handleUpdate : handleCreate}
            onCancel={() => { setShowForm(false); setEditingCampaign(null); }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Campaigns</h2>
          <p className="text-slate-500 mt-1">{campaigns.length} campaigns</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary inline-flex items-center gap-2">
          <Plus size={16} /> New Campaign
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="grid gap-4">
          {campaigns.map((campaign) => {
            const postalCodes = (() => { try { return JSON.parse(campaign.postal_codes || '[]'); } catch { return []; } })();
            const isActive = campaign.status === 'active';
            return (
            <div key={campaign.id} className="card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-slate-900 truncate">{campaign.name}</h3>
                    <span className={`badge ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                      {isActive ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-sm text-slate-500">
                    <span>Niche: <strong className="text-slate-700">{(campaign as any).niche_name || campaign.niche_id}</strong></span>
                    <span>Radius: <strong className="text-slate-700">{campaign.radius_km} km</strong></span>
                    <span>Limit: <strong className="text-slate-700">{campaign.daily_limit}/day</strong></span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {postalCodes.slice(0, 5).map((code: string) => (
                      <span key={code} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded">
                        {code}
                      </span>
                    ))}
                    {postalCodes.length > 5 && (
                      <span className="px-2 py-0.5 text-slate-500 text-xs">
                        +{postalCodes.length - 5} more
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4 text-sm">
                  <div className="text-center">
                    <div className="font-bold text-slate-900">{campaign.total_discovered || 0}</div>
                    <div className="text-xs text-slate-500">Prospects</div>
                  </div>
                  <div className="text-center">
                    {campaign.discovery_completed_at ? (
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded font-medium">
                        ✓ Discovery Done
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded font-medium">
                        ⏳ Discovering...
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleToggle(campaign)}
                    className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
                    title={isActive ? 'Pause' : 'Resume'}
                  >
                    {isActive ? <Pause size={16} /> : <Play size={16} />}
                  </button>
                  <button
                    onClick={() => setEditingCampaign(campaign)}
                    className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
                    title="Edit"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(campaign.id)}
                    className="p-2 rounded-lg hover:bg-red-50 text-red-500"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
            );
          })}

          {campaigns.length === 0 && (
            <div className="card p-12 text-center text-slate-500">
              No campaigns yet. Create your first one to get started.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
