import { useEffect, useState } from 'react';
import { Check, X, Clock, Mail } from 'lucide-react';
import api, { FollowUp } from '../lib/api';

const ROWS_PER_PAGE = 25;

export default function FollowUpsPage() {
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchFollowUps = async () => {
    setLoading(true);
    try {
      const data = await api.getFollowUps();
      const result = data.data || data;
      setFollowUps(Array.isArray(result) ? result : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFollowUps();
  }, []);

  const handleApprove = async (id: string) => {
    try {
      await api.approveFollowUps([id]);
      fetchFollowUps();
    } catch (err) {
      console.error(err);
    }
  };

  const handleReject = async (id: string) => {
    try {
      await api.rejectFollowUp(id);
      fetchFollowUps();
    } catch (err) {
      console.error(err);
    }
  };

  const totalPages = Math.ceil(followUps.length / ROWS_PER_PAGE);
  const displayData = followUps.slice(
    (currentPage - 1) * ROWS_PER_PAGE,
    currentPage * ROWS_PER_PAGE
  );
  const startItem = followUps.length === 0 ? 0 : (currentPage - 1) * ROWS_PER_PAGE + 1;
  const endItem = Math.min(currentPage * ROWS_PER_PAGE, followUps.length);

  const getPageNumbers = () => {
    const pages: number[] = [];
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Follow-ups</h2>
        <p className="text-slate-500 mt-1">
          Prospects who opened but didn't reply (4+ days). {followUps.length} pending.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full" />
        </div>
      ) : followUps.length === 0 ? (
        <div className="card p-12 text-center text-slate-500">
          <Clock size={48} className="mx-auto mb-4 text-slate-300" />
          <p className="text-lg font-medium">No follow-ups due</p>
          <p className="text-sm mt-1">All caught up! Check back later.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4">
            {displayData.map((fu) => {
              const daysSinceEmail = fu.email_sent_at
                ? Math.floor((Date.now() - new Date(fu.email_sent_at).getTime()) / (1000 * 60 * 60 * 24))
                : null;

              return (
                <div key={fu.id} className="card p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-slate-900">{fu.business_name}</h3>
                        {daysSinceEmail !== null && (
                          <span className="badge bg-amber-100 text-amber-700">
                            <Clock size={12} className="mr-1" />
                            {daysSinceEmail} days since email
                          </span>
                        )}
                        {fu.quality_score != null && (
                          <span className="badge bg-blue-100 text-blue-700">
                            Score: {fu.quality_score}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-sm text-slate-500">
                        <Mail size={14} />
                        <span>{fu.email}</span>
                        {fu.city && (
                          <>
                            <span className="text-slate-300">|</span>
                            <span>{[fu.city, fu.state_province].filter(Boolean).join(', ')}</span>
                          </>
                        )}
                      </div>
                      {fu.generated_site_url && (
                        <a
                          href={fu.generated_site_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline mt-2 inline-block"
                        >
                          View Generated Site
                        </a>
                      )}
                      <p className="text-xs text-slate-500 mt-2">
                        Email sent: {fu.email_sent_at ? new Date(fu.email_sent_at).toLocaleString() : 'N/A'}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 shrink-0">
                      <button
                        onClick={() => handleApprove(fu.id)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 font-medium"
                      >
                        <Check size={14} /> Approve
                      </button>
                      <button
                        onClick={() => handleReject(fu.id)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-200 text-slate-700 text-sm rounded-lg hover:bg-slate-300 font-medium"
                      >
                        <X size={14} /> Reject
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Controls */}
          {followUps.length > ROWS_PER_PAGE && (
            <div className="flex items-center justify-between mt-4 py-3 border-t border-slate-200">
              <span className="text-sm text-slate-500">
                Showing {startItem}-{endItem} of {followUps.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-sm rounded-md border border-slate-300 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                {getPageNumbers().map((page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`px-3 py-1.5 text-sm rounded-md border ${
                      page === currentPage
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'text-slate-600 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {page}
                  </button>
                ))}
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 text-sm rounded-md border border-slate-300 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
