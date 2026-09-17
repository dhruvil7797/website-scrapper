import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { EmailTemplate, TemplateCategory, Settings } from '@/types';

const CATEGORIES: { value: TemplateCategory; label: string }[] = [
  { value: 'no_website', label: 'No Website' },
  { value: 'outdated', label: 'Outdated Website' },
  { value: 'missing_features', label: 'Missing Features' },
  { value: 'slow', label: 'Slow Website' },
  { value: 'no_presence', label: 'No Online Presence' },
  { value: 'general', label: 'General' },
];

const PLACEHOLDERS = [
  'business_name', 'owner_name', 'city', 'state', 'niche', 'phone',
  'website_url', 'google_rating', 'review_count', 'pagespeed_score', 'pagespeed_url',
  'fcp', 'lcp', 'tbt', 'cls',
  'portfolio_link', 'sender_name', 'sending_email', 'company_name',
];

const SAMPLE_DATA: Record<string, string> = {
  business_name: 'Smith Plumbing', owner_name: 'John', city: 'Austin', state: 'TX',
  niche: 'plumber', phone: '(512) 555-0123', website_url: 'https://smithplumbing.com',
  google_rating: '4.7', review_count: '43', pagespeed_score: '35',
  pagespeed_url: 'https://pagespeed.web.dev/analysis/https-smithplumbing-com/abc123?form_factor=mobile',
  fcp: '10.4 s', lcp: '20.2 s', tbt: '740 ms', cls: '0',
  portfolio_link: 'https://cloudgenz.com/portfolio', sender_name: 'Dhruvil',
  sending_email: 'hello@cloudgenz.com', company_name: 'CloudGenZ',
};

function fillPreview(text: string): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => SAMPLE_DATA[key] || `{{${key}}}`);
}

interface FormState {
  id: string; name: string; category: TemplateCategory; subject: string;
  body_html: string; body_text: string;
}
const EMPTY: FormState = { id: '', name: '', category: 'general', subject: '', body_html: '', body_text: '' };

interface DirectSendState {
  templateId: string; toEmail: string; toName: string;
  subject: string; bodyText: string; bodyHtml: string;
}

export default function Templates() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [editing, setEditing] = useState<FormState | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [directSend, setDirectSend] = useState<DirectSendState | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const load = () => api.get<EmailTemplate[]>('/templates').then(setTemplates).catch(console.error);
  useEffect(() => { load(); api.get<Settings>('/settings').then(setSettings).catch(console.error); }, []);

  const handleSave = async () => {
    if (!editing) return;
    const placeholders = PLACEHOLDERS.filter(p => editing.body_text.includes(`{{${p}}}`) || editing.subject.includes(`{{${p}}}`));
    const payload = { ...editing, placeholders: JSON.stringify(placeholders) };
    if (editing.id) { await api.put(`/templates/${editing.id}`, payload); }
    else { await api.post('/templates', payload); }
    setEditing(null);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this template?')) return;
    await api.delete(`/templates/${id}`);
    load();
  };

  const insertPlaceholder = (p: string) => {
    if (!editing) return;
    const tag = `{{${p}}}`;
    setEditing({ ...editing, body_text: editing.body_text + tag, body_html: editing.body_html + tag });
  };

  const openDirectSend = (t: EmailTemplate) => {
    const data: Record<string, string> = { ...SAMPLE_DATA };
    if (settings) {
      data.portfolio_link = settings.portfolio_link || data.portfolio_link;
      data.sender_name = settings.sender_name || data.sender_name;
      data.sending_email = settings.sending_email || data.sending_email;
      data.company_name = settings.company_name || data.company_name;
    }
    setDirectSend({
      templateId: t.id, toEmail: '', toName: '',
      subject: t.subject, bodyText: t.body_text, bodyHtml: t.body_html,
    });
    setSent(false);
  };

  const fillDirectSend = () => {
    if (!directSend) return;
    const data: Record<string, string> = {};
    if (settings) {
      data.portfolio_link = settings.portfolio_link || '';
      data.sender_name = settings.sender_name || '';
      data.sending_email = settings.sending_email || '';
      data.company_name = settings.company_name || '';
    }
    if (directSend.toName) data.owner_name = directSend.toName;
    const fill = (t: string) => t.replace(/\{\{(\w+)\}\}/g, (_, k) => data[k] || `{{${k}}}`);
    setDirectSend({ ...directSend, subject: fill(directSend.subject), bodyText: fill(directSend.bodyText), bodyHtml: fill(directSend.bodyHtml) });
  };

  const handleDirectSend = async () => {
    if (!directSend?.toEmail) return;
    setSending(true);
    try {
      await api.post('/send-direct', {
        to_email: directSend.toEmail, to_name: directSend.toName,
        subject: directSend.subject, body_html: directSend.bodyHtml,
        body_text: directSend.bodyText, template_id: directSend.templateId,
      });
      setSent(true);
    } catch (e) { alert(e instanceof Error ? e.message : 'Send failed'); }
    setSending(false);
  };

  // Direct send modal
  if (directSend) {
    if (sent) {
      return (
        <div className="max-w-2xl mx-auto text-center py-12">
          <span className="text-5xl">✅</span>
          <h2 className="text-xl font-semibold mt-4">Email Sent!</h2>
          <p className="text-gray-500 mt-2">Sent to {directSend.toEmail}</p>
          <div className="mt-6 flex gap-3 justify-center">
            <button onClick={() => { setDirectSend(null); setSent(false); }} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700">Back to Templates</button>
            <button onClick={() => { setSent(false); setDirectSend({ ...directSend, toEmail: '', toName: '' }); }} className="border border-gray-300 px-4 py-2 rounded-md text-sm hover:bg-gray-50">Send to Another</button>
          </div>
        </div>
      );
    }

    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setDirectSend(null)} className="text-gray-400 hover:text-gray-600">← Back</button>
          <h1 className="text-2xl font-semibold text-gray-900">Send to Anyone</h1>
        </div>
        <div className="max-w-2xl space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">To Email *</label>
                <input value={directSend.toEmail} onChange={e => setDirectSend({ ...directSend, toEmail: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" placeholder="john@example.com" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Recipient Name</label>
                <div className="flex gap-1">
                  <input value={directSend.toName} onChange={e => setDirectSend({ ...directSend, toName: e.target.value })} className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm" placeholder="John" />
                  <button onClick={fillDirectSend} className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100 whitespace-nowrap">Fill placeholders</button>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
              <input value={directSend.subject} onChange={e => setDirectSend({ ...directSend, subject: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
              <textarea value={directSend.bodyText} onChange={e => setDirectSend({ ...directSend, bodyText: e.target.value, bodyHtml: e.target.value.replace(/\n/g, '<br>') })} rows={12} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleDirectSend} disabled={sending || !directSend.toEmail || !directSend.subject} className="bg-blue-600 text-white px-6 py-2.5 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {sending ? 'Sending...' : '📧 Send Email'}
            </button>
            <button onClick={() => setDirectSend(null)} className="text-gray-500 px-4 py-2 text-sm">Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  // Edit mode
  if (editing) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600">← Back</button>
          <h1 className="text-2xl font-semibold text-gray-900">{editing.id ? 'Edit Template' : 'New Template'}</h1>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Name</label><input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" required /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Category</label><select value={editing.category} onChange={e => setEditing({ ...editing, category: e.target.value as TemplateCategory })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">{CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Subject</label><input value={editing.subject} onChange={e => setEditing({ ...editing, subject: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" /></div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
                <textarea value={editing.body_text} onChange={e => setEditing({ ...editing, body_text: e.target.value, body_html: e.target.value.split('\n').map(l => l ? `<p>${l}</p>` : '').join('') })} rows={14} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono" />
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-2">Insert placeholder:</p>
                <div className="flex flex-wrap gap-1">{PLACEHOLDERS.map(p => <button key={p} onClick={() => insertPlaceholder(p)} className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-blue-100 hover:text-blue-700 font-mono">{`{{${p}}}`}</button>)}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleSave} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700">Save Template</button>
              <button onClick={() => setEditing(null)} className="text-gray-500 px-4 py-2 text-sm">Cancel</button>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-gray-900">Preview</h3>
              <button onClick={() => setShowPreview(!showPreview)} className="text-xs text-blue-600">{showPreview ? 'Raw' : 'Rendered'}</button>
            </div>
            <div className="border border-gray-200 rounded-md p-4 bg-gray-50">
              <p className="text-sm font-medium text-gray-700 mb-2">Subject: {fillPreview(editing.subject)}</p>
              <hr className="my-2" />
              {showPreview ? <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: fillPreview(editing.body_html) }} /> : <pre className="text-sm text-gray-600 whitespace-pre-wrap font-mono">{fillPreview(editing.body_text)}</pre>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Email Templates</h1>
        <button onClick={() => setEditing({ ...EMPTY })} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700">+ New Template</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map(t => (
          <div key={t.id} className="bg-white rounded-lg border border-gray-200 p-5 hover:border-blue-300 transition-colors">
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-medium text-gray-900">{t.name}</h3>
              <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">{t.category}</span>
            </div>
            <p className="text-sm text-gray-500 mb-1">Subject: {t.subject}</p>
            <p className="text-xs text-gray-400 mb-3">{t.body_text.substring(0, 100)}...</p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">Used {t.usage_count}x</span>
              <div className="flex gap-2">
                <button onClick={() => openDirectSend(t)} className="text-xs text-green-600 hover:text-green-700 font-medium">Send ✉️</button>
                <button onClick={() => setEditing({ id: t.id, name: t.name, category: t.category as TemplateCategory, subject: t.subject, body_html: t.body_html, body_text: t.body_text })} className="text-xs text-blue-600 hover:text-blue-700">Edit</button>
                <button onClick={() => setEditing({ ...EMPTY, name: `${t.name} (copy)`, category: t.category as TemplateCategory, subject: t.subject, body_html: t.body_html, body_text: t.body_text })} className="text-xs text-gray-500 hover:text-gray-700">Duplicate</button>
                <button onClick={() => handleDelete(t.id)} className="text-xs text-red-500 hover:text-red-700">Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
