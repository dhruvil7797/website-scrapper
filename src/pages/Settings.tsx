import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Settings as SettingsType } from '@/types';

const FIELDS: { key: keyof SettingsType; label: string; type?: string; placeholder?: string }[] = [
  { key: 'sender_name', label: 'Your Name', placeholder: 'Dhruvil' },
  { key: 'sending_email', label: 'Sending Email', placeholder: 'hello@cloudgenz.com' },
  { key: 'reply_to_email', label: 'Reply-To Email', placeholder: 'contact@cloudgenz.com' },
  { key: 'sending_domain', label: 'Sending Domain', placeholder: 'cloudgenz.com' },
  { key: 'company_name', label: 'Company Name', placeholder: 'CloudGenZ' },
  { key: 'company_phone', label: 'Company Phone', placeholder: '(555) 123-4567' },
  { key: 'company_address', label: 'Company Address', placeholder: '123 Main St, Austin TX' },
  { key: 'portfolio_link', label: 'Portfolio/Sample Site Link', placeholder: 'https://cloudgenz.com/portfolio' },
];

export default function Settings() {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [saved, setSaved] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    api.get<SettingsType>('/settings').then(setSettings).catch(console.error);
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    await api.put('/settings', { settings });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handlePasswordChange = async () => {
    if (!newPassword) return;
    await api.put('/settings', { settings: { admin_password: newPassword } });
    setNewPassword('');
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  if (!settings) return <div className="text-gray-400">Loading...</div>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Settings</h1>

      <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4 mb-6">
        <h2 className="font-medium text-gray-900">Email & Company</h2>
        {FIELDS.map(f => (
          <div key={f.key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
            <input
              type={f.type || 'text'}
              value={settings[f.key] || ''}
              onChange={e => setSettings({ ...settings, [f.key]: e.target.value })}
              placeholder={f.placeholder}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        ))}
        <button onClick={handleSave} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700">
          {saved ? '✓ Saved!' : 'Save Settings'}
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
        <h2 className="font-medium text-gray-900">Change Password</h2>
        <input
          type="password"
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
          placeholder="New password"
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button onClick={handlePasswordChange} disabled={!newPassword} className="bg-gray-800 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-900 disabled:opacity-50">
          Update Password
        </button>
      </div>
    </div>
  );
}
