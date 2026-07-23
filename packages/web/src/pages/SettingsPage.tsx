import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import api from '../lib/api';

interface SettingsState {
  [key: string]: string | number | undefined;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getSettings()
      .then((data: any) => setSettings(data || {}))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    try {
      // API expects key-value object, saveSettings sends POST
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(settings)) {
        if (v !== undefined && v !== null) {
          payload[k] = String(v);
        }
      }
      await api.saveSettings(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const update = (field: string, value: string | number) => {
    if (!settings) return;
    setSettings({ ...settings, [field]: value });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!settings) {
    return <div className="text-center py-12 text-slate-500">Failed to load settings</div>;
  }

  const rampLevel = Number(settings.ramp_level) || 1;
  const rampSteps = Number(settings.ramp_steps) || 10;
  const rampDaysPerStep = Number(settings.ramp_days_per_step) || 3;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Settings</h2>
        <p className="text-slate-500 mt-1">Sending configuration and thresholds</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Ramp Configuration */}
        <div className="card p-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900">Email Ramp Configuration</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Ramp Level</label>
              <input
                type="number"
                value={rampLevel}
                onChange={(e) => update('ramp_level', Number(e.target.value))}
                className="input"
                min={1}
                max={rampSteps}
              />
              <p className="text-xs text-slate-500 mt-1">Current sending level</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Ramp Steps</label>
              <input
                type="number"
                value={rampSteps}
                onChange={(e) => update('ramp_steps', Number(e.target.value))}
                className="input"
                min={1}
              />
              <p className="text-xs text-slate-500 mt-1">Total steps to full volume</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Days per Step</label>
              <input
                type="number"
                value={rampDaysPerStep}
                onChange={(e) => update('ramp_days_per_step', Number(e.target.value))}
                className="input"
                min={1}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Last Step Date</label>
              <input
                type="text"
                value={String(settings.ramp_last_step_date || '')}
                onChange={(e) => update('ramp_last_step_date', e.target.value)}
                className="input"
                placeholder="YYYY-MM-DD"
              />
            </div>
          </div>

          {/* Ramp progress bar */}
          <div className="mt-2">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-slate-600">Progress</span>
              <span className="font-bold text-slate-900">Level {rampLevel} / {rampSteps}</span>
            </div>
            <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all"
                style={{ width: `${Math.min((rampLevel / rampSteps) * 100, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Thresholds */}
        <div className="card p-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900">Thresholds</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Bounce Rate Threshold (%)</label>
              <input
                type="number"
                value={Number(settings.bounce_rate_threshold) || 5}
                onChange={(e) => update('bounce_rate_threshold', Number(e.target.value))}
                className="input"
                min={0}
                max={100}
              />
              <p className="text-xs text-slate-500 mt-1">Pause sending if bounce rate exceeds this</p>
            </div>
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center gap-4">
          <button type="submit" disabled={saving} className="btn-primary inline-flex items-center gap-2">
            <Save size={16} />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
          {saved && (
            <span className="text-sm text-emerald-600 font-medium">Settings saved successfully!</span>
          )}
        </div>
      </form>
    </div>
  );
}
