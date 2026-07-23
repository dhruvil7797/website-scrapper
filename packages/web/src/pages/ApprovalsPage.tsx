import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, RefreshCw, ExternalLink, Mail, Edit3 } from 'lucide-react';

interface PendingProspect {
  id: string;
  business_name: string;
  owner_name: string | null;
  email: string;
  city: string | null;
  state_province: string | null;
  niche_id: string | null;
  quality_score: number | null;
  qa_score: number | null;
  generated_site_url: string | null;
  draft_email_subject: string;
  draft_email_body_html: string;
  draft_email_body_text: string;
  approval_status: string;
  approval_comment: string | null;
}

export default function ApprovalsPage() {
  const [prospects, setProspects] = useState<PendingProspect[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PendingProspect | null>(null);
  const [comment, setComment] = useState('');
  const [editedEmail, setEditedEmail] = useState('');
  const [editedSubject, setEditedSubject] = useState('');
  const [showEmailEditor, setShowEmailEditor] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => { fetchPending(); }, []);

  async function fetchPending() {
    setLoading(true);
    try {
      const res = await fetch('/api/approvals', {
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
      });
      const data = await res.json();
      setProspects(Array.isArray(data) ? data : []);
    } catch { setProspects([]); }
    setLoading(false);
  }

  async function handleAction(action: 'approve' | 'request_changes' | 'rework' | 'reject') {
    if (!selected) return;
    setActionLoading(true);
    try {
      await fetch('/api/approvals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
        },
        body: JSON.stringify({
          prospectId: selected.id,
          action,
          comment: comment || undefined,
          editedEmail: editedEmail !== selected.email ? editedEmail : undefined,
          editedSubject: editedSubject !== selected.draft_email_subject ? editedSubject : undefined,
        }),
      });
      setSelected(null);
      setComment('');
      fetchPending();
    } catch (err) {
      alert('Action failed: ' + (err as Error).message);
    }
    setActionLoading(false);
  }

  if (loading) return <div className="p-8 text-center text-slate-500">Loading...</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Approval Queue</h1>
          <p className="text-sm text-slate-500 mt-1">
            Review generated sites and emails before they go out. {prospects.length} pending.
          </p>
        </div>
        <button onClick={fetchPending} className="px-3 py-2 text-sm bg-slate-100 rounded-lg hover:bg-slate-200">
          <RefreshCw size={16} className="inline mr-1" /> Refresh
        </button>
      </div>

      {prospects.length === 0 ? (
        <div className="bg-white border rounded-xl p-12 text-center">
          <CheckCircle size={48} className="mx-auto text-green-500 mb-4" />
          <p className="text-lg font-medium text-slate-700">All caught up!</p>
          <p className="text-sm text-slate-500">No prospects pending approval.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: List */}
          <div className="space-y-3">
            {prospects.map(p => (
              <div
                key={p.id}
                onClick={() => { setSelected(p); setEditedEmail(p.email); setEditedSubject(p.draft_email_subject); setComment(''); }}
                className={`bg-white border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md ${
                  selected?.id === p.id ? 'ring-2 ring-blue-500 border-blue-500' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-900">{p.business_name}</h3>
                    <p className="text-sm text-slate-500">{p.city}, {p.state_province} • {p.niche_id}</p>
                    <p className="text-xs text-slate-400 mt-1">To: {p.email}</p>
                  </div>
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-medium">
                    QA: {(p.qa_score || 0).toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Right: Detail + Actions */}
          {selected && (
            <div className="bg-white border rounded-xl p-6 sticky top-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">{selected.business_name}</h2>
              
              {/* Preview Site Link */}
              {selected.generated_site_url && (
                <a
                  href={selected.generated_site_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-blue-600 hover:underline mb-4 text-sm"
                >
                  <ExternalLink size={14} /> Preview Generated Site
                </a>
              )}

              {/* Email Preview */}
              <div className="border rounded-lg p-4 mb-4 bg-slate-50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-500 uppercase">Email Preview</span>
                  <button
                    onClick={() => setShowEmailEditor(!showEmailEditor)}
                    className="text-xs text-blue-600 flex items-center gap-1"
                  >
                    <Edit3 size={12} /> Edit
                  </button>
                </div>
                
                {showEmailEditor ? (
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs text-slate-500">To:</label>
                      <input
                        value={editedEmail}
                        onChange={e => setEditedEmail(e.target.value)}
                        className="w-full text-sm border rounded px-2 py-1 mt-0.5"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Subject:</label>
                      <input
                        value={editedSubject}
                        onChange={e => setEditedSubject(e.target.value)}
                        className="w-full text-sm border rounded px-2 py-1 mt-0.5"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Body:</label>
                      <div className="text-sm border rounded p-2 mt-0.5 bg-white max-h-40 overflow-y-auto"
                           dangerouslySetInnerHTML={{ __html: selected.draft_email_body_html }} />
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-slate-600"><strong>To:</strong> {selected.email}</p>
                    <p className="text-xs text-slate-600 mt-1"><strong>Subject:</strong> {selected.draft_email_subject}</p>
                    <div className="text-xs text-slate-600 mt-2 border-t pt-2 max-h-32 overflow-y-auto"
                         dangerouslySetInnerHTML={{ __html: selected.draft_email_body_html }} />
                  </>
                )}
              </div>

              {/* Comment field */}
              <textarea
                placeholder="Add feedback (for changes/rework)..."
                value={comment}
                onChange={e => setComment(e.target.value)}
                className="w-full text-sm border rounded-lg p-3 mb-4 resize-none h-20"
              />

              {/* Action buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleAction('approve')}
                  disabled={actionLoading}
                  className="flex items-center justify-center gap-2 bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                >
                  <CheckCircle size={16} /> Approve & Schedule
                </button>
                <button
                  onClick={() => handleAction('request_changes')}
                  disabled={actionLoading || !comment}
                  className="flex items-center justify-center gap-2 bg-amber-500 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50"
                >
                  <RefreshCw size={16} /> Request Changes
                </button>
                <button
                  onClick={() => handleAction('rework')}
                  disabled={actionLoading}
                  className="flex items-center justify-center gap-2 bg-slate-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
                >
                  <RefreshCw size={16} /> Complete Rework
                </button>
                <button
                  onClick={() => handleAction('reject')}
                  disabled={actionLoading}
                  className="flex items-center justify-center gap-2 bg-red-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  <XCircle size={16} /> Skip / Reject
                </button>
              </div>

              <p className="text-xs text-slate-400 mt-3 text-center">
                Approved emails are sent the next day at 8-9am in the prospect's timezone.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
