import { useEffect, useState } from 'react';
import api, { Email } from '../lib/api';

const ROWS_PER_PAGE = 25;

const statusBadge: Record<string, string> = {
  sent: 'bg-blue-100 text-blue-700',
  bounced: 'bg-red-100 text-red-700',
};

export default function EmailsPage() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchEmails = async () => {
    setLoading(true);
    try {
      const data = await api.getEmails({ status: statusFilter || undefined });
      const result = data.data || data;
      setEmails(Array.isArray(result) ? result : []);
      setTotal(data.total || (Array.isArray(result) ? result.length : 0));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmails();
  }, [statusFilter]);

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter]);

  const totalPages = Math.ceil(emails.length / ROWS_PER_PAGE);
  const displayData = emails.slice(
    (currentPage - 1) * ROWS_PER_PAGE,
    currentPage * ROWS_PER_PAGE
  );
  const startItem = emails.length === 0 ? 0 : (currentPage - 1) * ROWS_PER_PAGE + 1;
  const endItem = Math.min(currentPage * ROWS_PER_PAGE, emails.length);

  const getPageNumbers = () => {
    const pages: number[] = [];
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Email Log</h2>
          <p className="text-slate-500 mt-1">{total} emails</p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input w-auto"
        >
          <option value="">All Statuses</option>
          <option value="sent">Sent</option>
          <option value="bounced">Bounced</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase">Business</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase">To</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase">Subject</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase">Type</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase">Status</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase">Sent</th>
                  </tr>
                </thead>
                <tbody>
                  {displayData.map((email) => (
                    <tr key={email.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-4 text-slate-900 font-medium">
                        {(email as any).business_name || '-'}
                      </td>
                      <td className="py-3 px-4 text-slate-600">{email.to_address}</td>
                      <td className="py-3 px-4 text-slate-600 max-w-xs truncate">{email.subject}</td>
                      <td className="py-3 px-4 text-slate-500 text-xs">{email.email_type || '-'}</td>
                      <td className="py-3 px-4">
                        <span className={`badge ${statusBadge[email.status] || 'bg-slate-100 text-slate-700'}`}>
                          {email.status}
                        </span>
                        {email.status === 'bounced' && (email as any).bounce_reason && (
                          <span className="text-xs text-red-500 ml-2">{(email as any).bounce_reason}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {email.sent_at ? new Date(email.sent_at).toLocaleString() : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {emails.length === 0 && (
                <div className="text-center py-12 text-slate-500">No emails found</div>
              )}
            </div>
            {/* Pagination Controls */}
            {emails.length > ROWS_PER_PAGE && (
              <div className="flex items-center justify-between mt-4 py-3 px-4 border-t border-slate-200">
                <span className="text-sm text-slate-500">
                  Showing {startItem}-{endItem} of {emails.length}
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
    </div>
  );
}
