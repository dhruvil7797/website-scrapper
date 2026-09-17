import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import type { Prospect, EmailTemplate, Settings } from '@/types';

function fillTemplate(text: string, data: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] || `{{${key}}}`);
}

type Mode = 'email' | 'sms';

export default function Compose() {
  const { prospectId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [mode, setMode] = useState<Mode>((searchParams.get('mode') as Mode) || 'email');

  // Email fields
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [toEmail, setToEmail] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [replyToEmail, setReplyToEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [bodyText, setBodyText] = useState('');

  // SMS fields
  const [toPhone, setToPhone] = useState('');
  const [smsBody, setSmsBody] = useState('');

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentMode, setSentMode] = useState<Mode>('email');
  const [error, setError] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    if (!prospectId) return;
    api.get<Prospect>(`/prospects/${prospectId}`).then(p => {
      setProspect(p);
      setToEmail(p.email || '');
      setToPhone(p.phone || '');
    }).catch(console.error);
    api.get<EmailTemplate[]>('/templates').then(setTemplates).catch(console.error);
    api.get<Settings>('/settings').then(s => {
      setSettings(s);
      setFromEmail(s.sending_email || '');
      setReplyToEmail(s.reply_to_email || '');
    }).catch(console.error);
  }, [prospectId]);

  const placeholderData = (): Record<string, string> => {
    if (!prospect || !settings) return {};
    const psData = (() => { try { if (prospect.pagespeed_data) return JSON.parse(prospect.pagespeed_data); } catch {} return null; })();
    return {
      business_name: prospect.business_name, owner_name: prospect.owner_name || 'there',
      city: prospect.city || '', state: prospect.state_province || '',
      niche: prospect.niche_name || prospect.niche_id || '', phone: prospect.phone || '',
      website_url: prospect.website_url || '',
      google_rating: prospect.google_rating ? String(prospect.google_rating) : '',
      review_count: prospect.google_review_count ? String(prospect.google_review_count) : '',
      pagespeed_score: prospect.pagespeed_mobile ? String(prospect.pagespeed_mobile) : '',
      pagespeed_url: prospect.website_url ? `https://pagespeed.web.dev/analysis/${encodeURIComponent(prospect.website_url)}?form_factor=mobile` : '',
      fcp: psData?.fcp?.replace(/\u00a0/g, ' ') || '', lcp: psData?.lcp?.replace(/\u00a0/g, ' ') || '',
      tbt: psData?.tbt?.replace(/\u00a0/g, ' ') || '', cls: psData?.cls || '',
      portfolio_link: settings.portfolio_link || '', sender_name: settings.sender_name || '',
      sending_email: fromEmail || settings.sending_email || '', company_name: settings.company_name || '',
    };
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    const tpl = templates.find(t => t.id === templateId);
    if (!tpl) return;
    const data = placeholderData();
    if (mode === 'sms') {
      setSmsBody(fillTemplate(tpl.body_text, data));
    } else {
      setSubject(fillTemplate(tpl.subject, data));
      setBodyHtml(fillTemplate(tpl.body_html, data));
      setBodyText(fillTemplate(tpl.body_text, data));
    }
  };

  const handleSendEmail = async () => {
    if (!toEmail || !subject || !bodyHtml) return;
    setSending(true); setError('');
    try {
      await api.post('/send-email', {
        prospect_id: prospect?.id, template_id: selectedTemplate || null,
        to_email: toEmail, from_email: fromEmail, reply_to_email: replyToEmail,
        sender_name: settings?.sender_name, subject, body_html: bodyHtml, body_text: bodyText,
      });
      setSent(true); setSentMode('email');
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to send'); }
    setSending(false);
  };

  const handleSendSms = async () => {
    if (!toPhone || !smsBody) return;
    setSending(true); setError('');
    try {
      await api.post('/send-sms', {
        prospect_id: prospect?.id, to_phone: toPhone, body: smsBody, template_id: selectedTemplate || null,
      });
      setSent(true); setSentMode('sms');
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to send'); }
    setSending(false);
  };

  const handleAiDraft = async () => {
    if (!aiInstruction || !prospect) return;
    setAiLoading(true); setError('');
    try {
      const result = await api.post<{ subject?: string; body: string }>('/ai-draft', {
        prospect_id: prospect.id, instruction: aiInstruction, mode,
      });
      if (mode === 'sms') {
        setSmsBody(result.body);
      } else {
        if (result.subject) setSubject(result.subject);
        setBodyText(result.body);
        setBodyHtml(result.body.replace(/\n/g, '<br>'));
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'AI draft failed'); }
    setAiLoading(false);
  };

  if (!prospect || !settings) return <div className="text-gray-400">Loading...</div>;

  if (sent) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <span className="text-5xl">{sentMode === 'sms' ? '📱' : '✅'}</span>
        <h2 className="text-xl font-semibold text-gray-900 mt-4">{sentMode === 'sms' ? 'SMS Sent!' : 'Email Sent!'}</h2>
        <p className="text-gray-500 mt-2">{sentMode === 'sms' ? `SMS sent to ${toPhone}` : `Email sent to ${toEmail}`} for {prospect.business_name}</p>
        <div className="mt-6 flex gap-3 justify-center">
          <button onClick={() => navigate('/prospects')} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700">Back to Prospects</button>
          <button onClick={() => { setSent(false); setSubject(''); setBodyHtml(''); setBodyText(''); setSmsBody(''); setSelectedTemplate(''); }} className="border border-gray-300 px-4 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-50">Send Another</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/prospects')} className="text-gray-400 hover:text-gray-600">← Back</button>
        <h1 className="text-2xl font-semibold text-gray-900">Contact Prospect</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Prospect info */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 h-fit space-y-3">
          <h2 className="font-semibold text-gray-900">{prospect.business_name}</h2>
          <div className="space-y-1.5 text-sm">
            {prospect.email && <div><span className="text-gray-500">Email:</span> {prospect.email}</div>}
            {prospect.phone && <div><span className="text-gray-500">Phone:</span> {prospect.phone}</div>}
            {prospect.city && <div><span className="text-gray-500">City:</span> {prospect.city}, {prospect.state_province}</div>}
            {prospect.google_rating && <div><span className="text-gray-500">Rating:</span> {prospect.google_rating}⭐ ({prospect.google_review_count})</div>}
            <div><span className="text-gray-500">Score:</span> <span className="font-semibold">{prospect.quality_score}/100</span></div>
            {prospect.email_count > 0 && <div className="text-yellow-600 text-xs">⚠️ Emailed {prospect.email_count}x</div>}
            {prospect.sms_count > 0 && <div className="text-yellow-600 text-xs">⚠️ SMS'd {prospect.sms_count}x</div>}
          </div>
        </div>

        {/* Right: Compose area */}
        <div className="lg:col-span-2 space-y-4">
          {/* Mode toggle */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
            <button onClick={() => setMode('email')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === 'email' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
              ✉️ Email
            </button>
            <button onClick={() => setMode('sms')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === 'sms' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
              📱 SMS
            </button>
          </div>

          {/* Template selector */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <label className="block text-sm font-medium text-gray-700 mb-2">Template</label>
            <select value={selectedTemplate} onChange={e => handleTemplateSelect(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
              <option value="">Select template...</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.category})</option>)}
            </select>
          </div>

          {/* AI Draft Assistant */}
          <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200 p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🤖</span>
              <h3 className="font-medium text-gray-900 text-sm">AI Draft Assistant</h3>
              <span className="text-xs text-gray-400">powered by Gemini</span>
            </div>
            <div className="flex gap-2">
              <textarea
                value={aiInstruction}
                onChange={e => setAiInstruction(e.target.value)}
                placeholder={mode === 'sms'
                  ? "e.g. Their website is down, mention urgency. Keep it casual."
                  : "e.g. Their website is really slow and outdated. Mention their great reviews but poor site speed. Friendly but direct tone."}
                rows={2}
                className="flex-1 px-3 py-2 border border-purple-200 rounded-md text-sm bg-white placeholder:text-gray-400"
              />
              <button
                onClick={handleAiDraft}
                disabled={aiLoading || !aiInstruction}
                className="px-4 py-2 bg-purple-600 text-white rounded-md text-sm font-medium hover:bg-purple-700 disabled:opacity-50 whitespace-nowrap self-end"
              >
                {aiLoading ? '✨ Generating...' : '✨ Generate'}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">Describe the tone and angle. AI uses all prospect data (rating, PageSpeed, location) to write a personalized {mode === 'sms' ? 'SMS' : 'email'}.</p>
          </div>

          {mode === 'email' ? (
            <>
              {/* To / From / Reply-To */}
              <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
                    <input value={toEmail} onChange={e => setToEmail(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" placeholder="recipient@example.com" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
                    <input value={fromEmail} onChange={e => setFromEmail(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" placeholder="hello@cloudgenz.com" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Reply-To</label>
                    <input value={replyToEmail} onChange={e => setReplyToEmail(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" placeholder="contact@cloudgenz.com" />
                  </div>
                </div>
              </div>

              {/* Subject */}
              <div className="bg-white rounded-lg border border-gray-200 p-5">
                <label className="block text-sm font-medium text-gray-700 mb-2">Subject</label>
                <input value={subject} onChange={e => setSubject(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
              </div>

              {/* Body */}
              <div className="bg-white rounded-lg border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">Body</label>
                  <button onClick={() => setShowPreview(!showPreview)} className="text-xs text-blue-600">{showPreview ? 'Edit' : 'Preview'}</button>
                </div>
                {showPreview ? (
                  <div className="prose prose-sm max-w-none border border-gray-200 rounded-md p-4 bg-gray-50" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
                ) : (
                  <textarea value={bodyText} onChange={e => { setBodyText(e.target.value); setBodyHtml(e.target.value.replace(/\n/g, '<br>')); }} rows={15} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono" />
                )}
              </div>

              {error && <p className="text-red-500 text-sm">{error}</p>}
              <div className="flex gap-3">
                <button onClick={handleSendEmail} disabled={sending || !toEmail || !subject || !bodyText} className="bg-blue-600 text-white px-6 py-2.5 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {sending ? 'Sending...' : '✉️ Send Email'}
                </button>
                <button onClick={() => navigate('/prospects')} className="text-gray-500 px-4 py-2 text-sm">Cancel</button>
              </div>
            </>
          ) : (
            <>
              {/* SMS: To phone */}
              <div className="bg-white rounded-lg border border-gray-200 p-5">
                <label className="block text-xs font-medium text-gray-500 mb-1">To Phone</label>
                <input value={toPhone} onChange={e => setToPhone(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" placeholder="+16045551234" />
                <p className="text-xs text-gray-400 mt-1">Include country code (e.g. +1 for US/Canada)</p>
              </div>

              {/* SMS body */}
              <div className="bg-white rounded-lg border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">Message</label>
                  <span className={`text-xs ${smsBody.length > 160 ? 'text-orange-600' : 'text-gray-400'}`}>
                    {smsBody.length}/160 {smsBody.length > 160 ? `(${Math.ceil(smsBody.length / 153)} segments)` : ''}
                  </span>
                </div>
                <textarea value={smsBody} onChange={e => setSmsBody(e.target.value)} rows={6} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" placeholder="Hi {{owner_name}}..." />
              </div>

              {error && <p className="text-red-500 text-sm">{error}</p>}
              <div className="flex gap-3">
                <button onClick={handleSendSms} disabled={sending || !toPhone || !smsBody} className="bg-green-600 text-white px-6 py-2.5 rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                  {sending ? 'Sending...' : '📱 Send SMS'}
                </button>
                <button onClick={() => navigate('/prospects')} className="text-gray-500 px-4 py-2 text-sm">Cancel</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
