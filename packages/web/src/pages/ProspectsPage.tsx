import { useEffect, useState } from 'react';
import { Search, Plus, X } from 'lucide-react';
import api, { Prospect } from '../lib/api';
import ProspectTable from '../components/ProspectTable';

const ROWS_PER_PAGE = 25;

const NICHES = [
  { id: 'plumber', label: 'Plumber' },
  { id: 'electrician', label: 'Electrician' },
  { id: 'roofer', label: 'Roofer' },
  { id: 'hvac', label: 'HVAC' },
  { id: 'landscaper', label: 'Landscaper' },
  { id: 'painter', label: 'Painter' },
  { id: 'barber', label: 'Barber' },
  { id: 'dentist', label: 'Dentist' },
  { id: 'chiropractor', label: 'Chiropractor' },
  { id: 'mechanic', label: 'Mechanic' },
  { id: 'veterinarian', label: 'Veterinarian' },
  { id: 'accountant', label: 'Accountant' },
  { id: 'restaurant', label: 'Restaurant' },
  { id: 'cleaning', label: 'Cleaning' },
  { id: 'pest_control', label: 'Pest Control' },
  { id: 'fence_installer', label: 'Fence Installer' },
];

interface ProspectForm {
  business_name: string;
  email: string;
  phone_raw: string;
  city: string;
  state_province: string;
  niche_id: string;
  website_url: string;
  owner_name: string;
  notes: string;
}

const emptyForm: ProspectForm = {
  business_name: '',
  email: '',
  phone_raw: '',
  city: '',
  state_province: '',
  niche_id: '',
  website_url: '',
  owner_name: '',
  notes: '',
};

export default function ProspectsPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [sortField, setSortField] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [total, setTotal] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ProspectForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const fetchProspects = async () => {
    setLoading(true);
    try {
      const data = await api.getProspects({
        search: search || undefined,
        stage: stageFilter || undefined,
        sortBy: sortField,
        sortDir: sortOrder,
        pageSize: 1000,
      });
      const result = data.data || data;
      setProspects(Array.isArray(result) ? result : []);
      setTotal(data.total || (Array.isArray(result) ? result.length : 0));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProspects();
  }, [stageFilter, sortField, sortOrder]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [stageFilter, search, sortField, sortOrder]);

  const totalPages = Math.ceil(prospects.length / ROWS_PER_PAGE);
  const displayData = prospects.slice(
    (currentPage - 1) * ROWS_PER_PAGE,
    currentPage * ROWS_PER_PAGE
  );
  const startItem = prospects.length === 0 ? 0 : (currentPage - 1) * ROWS_PER_PAGE + 1;
  const endItem = Math.min(currentPage * ROWS_PER_PAGE, prospects.length);

  const getPageNumbers = () => {
    const pages: number[] = [];
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchProspects();
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const handleBatchAction = async (action: string) => {
    if (selectedIds.length === 0) return;
    try {
      await api.batchAction(selectedIds, action);
      setSelectedIds([]);
      fetchProspects();
    } catch (err) {
      console.error(err);
    }
  };

  const handleFormChange = (field: keyof ProspectForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFormError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.business_name || !form.email || !form.city || !form.state_province) {
      setFormError('Please fill in all required fields.');
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      await api.createProspect({
        business_name: form.business_name,
        email: form.email,
        phone_raw: form.phone_raw || null,
        city: form.city,
        state_province: form.state_province,
        niche_id: form.niche_id || null,
        website_url: form.website_url || null,
        owner_name: form.owner_name || null,
        notes: form.notes || null,
        stage: 'scraped',
        quality_score: 100,
        has_website: form.website_url ? 1 : 0,
        source: 'manual',
      });
      setForm(emptyForm);
      setShowForm(false);
      fetchProspects();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create prospect');
    } finally {
      setSubmitting(false);
    }
  };

  const stages = ['', 'discovered', 'scraped', 'enriched', 'email_generated', 'approved', 'sent', 'opened', 'clicked', 'replied'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Prospects</h2>
          <p className="text-slate-500 mt-1">{total} total prospects</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
        >
          {showForm ? <X size={16} /> : <Plus size={16} />}
          {showForm ? 'Close' : 'Add Prospect'}
        </button>
      </div>

      {/* Add Prospect Form */}
      {showForm && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-lg transition-all">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">New Prospect</h3>
          {formError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {formError}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Business Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.business_name}
                  onChange={(e) => handleFormChange('business_name', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  placeholder="Acme Plumbing Co."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => handleFormChange('email', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  placeholder="owner@business.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                <input
                  type="text"
                  value={form.phone_raw}
                  onChange={(e) => handleFormChange('phone_raw', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  placeholder="(555) 123-4567"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  City <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => handleFormChange('city', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  placeholder="Toronto"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  State/Province <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.state_province}
                  onChange={(e) => handleFormChange('state_province', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  placeholder="ON"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Niche</label>
                <select
                  value={form.niche_id}
                  onChange={(e) => handleFormChange('niche_id', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                >
                  <option value="">Select niche...</option>
                  {NICHES.map((n) => (
                    <option key={n.id} value={n.id}>{n.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Website URL</label>
                <input
                  type="url"
                  value={form.website_url}
                  onChange={(e) => handleFormChange('website_url', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  placeholder="https://example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Owner Name</label>
                <input
                  type="text"
                  value={form.owner_name}
                  onChange={(e) => handleFormChange('owner_name', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  placeholder="John Smith"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => handleFormChange('notes', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-y"
                placeholder="Additional notes about this prospect..."
              />
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? 'Creating...' : 'Create Prospect'}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setForm(emptyForm); setFormError(''); }}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <form onSubmit={handleSearch} className="flex-1 min-w-[200px] relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-9"
              placeholder="Search by business name or email..."
            />
          </form>
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="input w-auto"
          >
            <option value="">All Stages</option>
            {stages.filter(Boolean).map((s) => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Batch Actions */}
      {selectedIds.length > 0 && (
        <div className="card p-4 bg-blue-50 border-blue-200 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-blue-900">
            {selectedIds.length} selected
          </span>
          <button
            onClick={() => handleBatchAction('approve')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700"
          >
            Approve for Email
          </button>
          <button
            onClick={() => handleBatchAction('prioritize')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700"
          >
            ⭐ Prioritize
          </button>
          <button
            onClick={() => handleBatchAction('skip')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-600 text-white text-sm rounded-lg hover:bg-slate-700"
          >
            Skip
          </button>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full" />
          </div>
        ) : (
          <>
            <ProspectTable
              prospects={displayData}
              selectedIds={selectedIds}
              onSelectChange={setSelectedIds}
              onSort={handleSort}
              sortField={sortField}
              sortOrder={sortOrder}
            />
            {/* Pagination Controls */}
            {prospects.length > ROWS_PER_PAGE && (
              <div className="flex items-center justify-between mt-4 py-3 px-4 border-t border-slate-200">
                <span className="text-sm text-slate-500">
                  Showing {startItem}-{endItem} of {prospects.length}
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
