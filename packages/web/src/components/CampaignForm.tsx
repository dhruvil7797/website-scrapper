import { useState, useEffect } from 'react';
import { Campaign } from '../lib/api';

interface CampaignFormProps {
  campaign?: Campaign | null;
  onSubmit: (data: Partial<Campaign>) => void;
  onCancel: () => void;
}

const niches = [
  'Plumbing',
  'HVAC',
  'Roofing',
  'Electrical',
  'Landscaping',
  'Cleaning',
  'Painting',
  'General Contractor',
  'Auto Repair',
  'Dental',
  'Real Estate',
  'Legal',
  'Accounting',
  'Restaurant',
  'Fitness',
  'Other',
];

export default function CampaignForm({ campaign, onSubmit, onCancel }: CampaignFormProps) {
  const [name, setName] = useState('');
  const [niche_id, setNicheId] = useState('');
  const [customNiche, setCustomNiche] = useState('');
  const [postalCodes, setPostalCodes] = useState('');
  const [radius_km, setRadiusKm] = useState(25);
  
  const [status, setStatus] = useState<'active' | 'paused'>('active');

  useEffect(() => {
    if (campaign) {
      setName(campaign.name);
      setNicheId(campaign.niche_id || '');
      // postal_codes is a JSON string from the API
      try {
        const codes = JSON.parse(campaign.postal_codes || '[]');
        setPostalCodes(Array.isArray(codes) ? codes.join(', ') : '');
      } catch {
        setPostalCodes('');
      }
      setRadiusKm(campaign.radius_km);
      setStatus(campaign.status === 'active' ? 'active' : 'paused');
    }
  }, [campaign]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const codes = postalCodes.split(',').map((c) => c.trim()).filter(Boolean);
    onSubmit({
      name,
      niche_id: niche_id === 'Other' ? customNiche.toLowerCase().replace(/\s+/g, '_') : niche_id,
      postal_codes: JSON.stringify(codes),
      radius_km,
      daily_limit: 999,
      status,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Campaign Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input"
          placeholder="e.g. Portland Plumbers Q1"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Niche</label>
        <select value={niche_id} onChange={(e) => setNicheId(e.target.value)} className="input" required>
          <option value="">Select niche...</option>
          {niches.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        {niche_id === 'Other' && (
          <input
            type="text"
            placeholder="Type your niche (e.g. Fence Installer, Chimney Sweep)"
            value={customNiche}
            onChange={(e) => setCustomNiche(e.target.value)}
            className="input mt-2"
            required
          />
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Postal Codes</label>
        <input
          type="text"
          value={postalCodes}
          onChange={(e) => setPostalCodes(e.target.value)}
          className="input"
          placeholder="97201, 97202, 97203"
          required
        />
        <p className="text-xs text-slate-500 mt-1">Comma-separated postal codes</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Radius (km)</label>
          <input
            type="number"
            value={radius_km}
            onChange={(e) => setRadiusKm(Number(e.target.value))}
            className="input"
            min={1}
            max={200}
          />
        </div>

      </div>

      <div className="flex items-center gap-3">
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={status === 'active'}
            onChange={(e) => setStatus(e.target.checked ? 'active' : 'paused')}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-slate-200 peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
        </label>
        <span className="text-sm font-medium text-slate-700">
          {status === 'active' ? 'Active' : 'Paused'}
        </span>
      </div>

      <div className="flex gap-3 pt-4 border-t border-slate-200">
        <button type="submit" className="btn-primary">
          {campaign ? 'Update Campaign' : 'Create Campaign'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}
