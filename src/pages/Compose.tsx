import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import type { Prospect, EmailTemplate, Settings } from '@/types';

function fillTemplate(text: string, data: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] || `{{${key}}}`);
}

export default function Compose() {
  const { prospectId } = useParams();
  const navigate = useNavigate();
  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!prospectId) return;
    api.get<Prospect>(`/prospects/${prospectId}`).then(setProspect).catch(console.error);
    api.get<EmailTemplate[]>('/templates').then(setTemplates).catch(console.error);
    api.get<Settings>('/settings').then(setSettings).catch(console.error);
  }, [prospectId]);

  const placeholderData = (): Record<string, string> => {
    if (!prospect || !settings) return {};
    const psData = (() => {
      try {
        const raw = prospect.pagespeed_data;
        if (raw) return JSON.parse(raw) as { fcp?: string; lcp?: string; tbt?: string; cls?: string };
      } catch { /* ignore */ }
      return null;
    })();

    return {
      business_name: prospect.business_name,
      owner_name: prospect.owner_name || 'there',
      city: prospect.city || '',
      state: prospect.state_province || '',
      niche: prospect.niche_name || prospect.niche_id || '',
      phone: prospect.phone || '',
      website_url: prospect.website_url || '',
      google_rating: prospect.google_rating ? String(prospect.google_rating) : '',
      review_count: prospect.google_review_count ? String(prospect.google_review_count) : '',
      pagespeed_score: prospect.pagespeed_mobile ? String(prospect.pagespeed_mobile) : '',
      pagespeed_url: prospect.website_url ? `https://pagespeed.web.dev/analysis/${encodeURIComponent(prospect.website_url)}?form_factor=mobile` : '',
      fcp: psData?.fcp?.replace(/\u00a0/g, ' ') || '',
      lcp: psData?.lcp?.replace(/\u00a0/g, ' ') || '',
      tbt: psData?.tbt?.replace(/\u00a0/g, ' ') || '',
      cls: psData?.cls || '',
      portfolio_link: settings.portfolio_link || '',
      sender_name: settings.sender_name || '',
      sending_email: settings.sending_email || '',
      company_name: settings.company_name || '',
    };
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    const tpl = templates.find(t => t.id === templateId);
    if (!tpl) return;
    const data = placeholderData();
    setSubject(fillTemplate(tpl.subject, data));
    setBodyHtml(fillTemplate(tpl.body_html, data));
    setBodyText(fillTemplate(tpl.body_text, data));
  };

  const handleSend = async () => {
    if (!prospect?.email || !subject || !bodyHtml) return;
    setSending(true);
    setError('');
    try {
      await api.post('/send-email', {
        prospect_id: prospect.id,
        template_id: selectedTemplate || null,
        subject,
        body_html: bodyHtml,
        body_text: bodyText,
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    }
    setSending(false);
  };

  if (!prospect || !settings) return <div className="text-gray-400">Loading...</div>;
  if (!prospect.email) return <div className="text-red-500">This prospect has no email address.</div>;

  if (sent) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <span className="text-5xl">✅</span>
        <h2 className="text-xl font-semibold text-gray-900 mt-4">Email Sent!</h2>
        <p className="text-gray-500 mt-2">Email sent to {prospect.email} for {prospect.business_name}</p>
        <div className="mt-6 flex gap-3 justify-center">
          <button onClick={() => navigate('/prospects')} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700">
            Back to Prospects
          </button>
          <button onClick={() => { setSent(false); setSubject(''); setBodyHtml(''); setBodyText(''); setSelectedTemplate(''); }} className="border border-gray-300 px-4 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-50">
            Send Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/prospects')} className="text-gray-400 hover:text-gray-600">← Back</button>
        <h1 className="text-2xl font-semibold text-gray-900">Compose Email</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Prospect info */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 h-fit">
          <h2 className="font-semibold text-gray-900 mb-3">{prospect.business_name}</h2>
          <div className="space-y-2 text-sm">
            <div><span className="text-gray-500">To:</span> <span className="font-medium">{prospect.email}</span></div>
            {prospect.city && <div><span className="text-gray-500">City:</span> {prospect.city}, {prospect.state_province}</div>}
            {prospect.phone && <div><span className="text-gray-500">Phone:</span> {prospect.phone}</div>}
            {prospect.website_url && <div><span className="text-gray-500">Website:</span> <a href={prospect.website_url} target="_blank" className="text-blue-600 truncate block">{prospect.website_url}</a></div>}
            {prospect.google_rating && <div><span className="text-gray-500">Rating:</span> {prospect.google_rating}⭐ ({prospect.google_review_count})</div>}
            <div><span className="text-gray-500">Score:</span> <span className="font-semibold">{prospect.quality_score}/100</span></div>
            {prospect.email_count > 0 && <div className="text-yellow-600 text-xs font-medium">⚠️ Already emailed {prospect.email_count} time(s)</div>}
          </div>
        </div>

        {/* Right: Compose area */}
        <div className="lg:col-span-2 space-y-4">
          {/* Template selector */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <label className="block text-sm font-medium text-gray-700 mb-2">Email Template</label>
            <select
              value={selectedTemplate}
              onChange={e => handleTemplateSelect(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select template...</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.category})</option>)}
            </select>
          </div>

          {/* Subject */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <label className="block text-sm font-medium text-gray-700 mb-2">Subject</label>
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500"
              placeholder="Email subject..."
            />
          </div>

          {/* Body */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Body</label>
              <button onClick={() => setShowPreview(!showPreview)} className="text-xs text-blue-600 hover:text-blue-700">
                {showPreview ? 'Edit' : 'Preview'}
              </button>
            </div>
            {showPreview ? (
              <div className="prose prose-sm max-w-none border border-gray-200 rounded-md p-4 bg-gray-50" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
            ) : (
              <textarea
                value={bodyText}
                onChange={e => { setBodyText(e.target.value); setBodyHtml(e.target.value.replace(/\n/g, '<br>')); }}
                rows={15}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:ring-2 focus:ring-blue-500"
                placeholder="Email body..."
              />
            )}
          </div>

          {/* Send */}
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="flex gap-3">
            <button
              onClick={handleSend}
              disabled={sending || !subject || !bodyText}
              className="bg-blue-600 text-white px-6 py-2.5 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? 'Sending...' : '📧 Send Email'}
            </button>
            <button onClick={() => navigate('/prospects')} className="text-gray-500 px-4 py-2 text-sm">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
