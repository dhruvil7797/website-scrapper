import { Prospect } from '../lib/api';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

interface ProspectTableProps {
  prospects: Prospect[];
  selectedIds: string[];
  onSelectChange: (ids: string[]) => void;
  onSort: (field: string) => void;
  sortField: string;
  sortOrder: 'asc' | 'desc';
}

const stageBadge: Record<string, string> = {
  discovered: 'bg-slate-100 text-slate-700',
  scraped: 'bg-slate-200 text-slate-800',
  enriched: 'bg-blue-100 text-blue-700',
  email_generated: 'bg-indigo-100 text-indigo-700',
  approved: 'bg-purple-100 text-purple-700',
  sent: 'bg-amber-100 text-amber-700',
  opened: 'bg-emerald-100 text-emerald-700',
  clicked: 'bg-emerald-200 text-emerald-800',
  replied: 'bg-green-200 text-green-800',
};

export default function ProspectTable({
  prospects,
  selectedIds,
  onSelectChange,
  onSort,
  sortField,
  sortOrder,
}: ProspectTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleSelect = (id: string) => {
    onSelectChange(
      selectedIds.includes(id)
        ? selectedIds.filter((i) => i !== id)
        : [...selectedIds, id]
    );
  };

  const toggleAll = () => {
    onSelectChange(
      selectedIds.length === prospects.length ? [] : prospects.map((p) => p.id)
    );
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <span className="text-slate-300 ml-1">↕</span>;
    return sortOrder === 'asc' ? (
      <ChevronUp size={14} className="inline ml-1" />
    ) : (
      <ChevronDown size={14} className="inline ml-1" />
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="py-3 px-4 text-left">
              <input
                type="checkbox"
                checked={selectedIds.length === prospects.length && prospects.length > 0}
                onChange={toggleAll}
                className="rounded border-slate-300"
              />
            </th>
            <th className="py-3 px-4 text-left cursor-pointer select-none" onClick={() => onSort('business_name')}>
              Business <SortIcon field="business_name" />
            </th>
            <th className="py-3 px-4 text-left cursor-pointer select-none" onClick={() => onSort('stage')}>
              Stage <SortIcon field="stage" />
            </th>
            <th className="py-3 px-4 text-left cursor-pointer select-none" onClick={() => onSort('quality_score')}>
              Score <SortIcon field="quality_score" />
              <span className="relative group ml-1">
                <span className="text-slate-400 cursor-help text-xs">ⓘ</span>
                <div className="absolute left-0 top-6 z-50 hidden group-hover:block bg-slate-900 text-white text-xs rounded-lg p-4 w-72 shadow-xl">
                  <div className="font-semibold mb-2 text-sm">How Score Works (0-100)</div>
                  <div className="space-y-1 text-slate-300">
                    <div className="font-medium text-white mt-1">Positive signals:</div>
                    <div>+30 — No website (biggest opportunity)</div>
                    <div>+25 — Outdated design (AI vision score &lt;40)</div>
                    <div>+15 — Mobile unfriendly (PageSpeed &lt;50)</div>
                    <div>+10 — Slow site (PageSpeed &lt;40)</div>
                    <div>+10 — High Google rating (4.0+)</div>
                    <div>+10 — Recently opened (&lt;2 years)</div>
                    <div>+10 — Free email (gmail = no web investment)</div>
                    <div>+5 — Custom domain email</div>
                    <div>+5 — Low reviews but active (&lt;20)</div>
                    <div className="font-medium text-white mt-2">Negative signals:</div>
                    <div>-5 — No email found</div>
                    <div>-10 — Multiple locations</div>
                    <div>-20 — Franchise brand</div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-700 text-slate-400">Higher score = better prospect. Generator processes highest scores first.</div>
                </div>
              </span>
            </th>
            <th className="py-3 px-4 text-left">Email</th>
            <th className="py-3 px-4 text-left cursor-pointer select-none" onClick={() => onSort('created_at')}>
              Date <SortIcon field="created_at" />
            </th>
          </tr>
        </thead>
        <tbody>
          {prospects.map((prospect) => (
            <>
              <tr
                key={prospect.id}
                className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                onClick={() => setExpandedId(expandedId === prospect.id ? null : prospect.id)}
              >
                <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(prospect.id)}
                    onChange={() => toggleSelect(prospect.id)}
                    className="rounded border-slate-300"
                  />
                </td>
                <td className="py-3 px-4">
                  <div className="font-medium text-slate-900">{prospect.business_name}</div>
                  <div className="text-xs text-slate-500">
                    {[prospect.city, prospect.state_province].filter(Boolean).join(', ') || 'No location'}
                  </div>
                </td>
                <td className="py-3 px-4">
                  <span className={`badge ${stageBadge[prospect.stage] || 'bg-slate-100 text-slate-700'}`}>
                    {prospect.stage.replace('_', ' ')}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2 relative group">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold cursor-help">
                      {prospect.quality_score ?? '-'}
                    </div>
                    <div className="absolute left-10 top-0 z-50 hidden group-hover:block bg-slate-900 text-white text-xs rounded-lg p-3 w-56 shadow-xl">
                      <div className="font-semibold mb-1">Score Breakdown</div>
                      <div className="space-y-0.5 text-slate-300">
                        <div>{!(prospect as any).has_website ? '✅ +30 No website' : (prospect as any).pagespeed_mobile < 50 ? '✅ +15 Mobile unfriendly' : '— Has website'}</div>
                        <div>{(prospect as any).google_rating >= 4.0 ? '✅ +10 High rating' : '— Rating < 4.0'}</div>
                        <div>{prospect.email ? ((prospect as any).email_type === 'free_provider' ? '✅ +10 Free email (big opportunity)' : '✅ +5 Custom domain email') : '❌ -5 No email found'}</div>
                        <div>{(prospect as any).google_review_count < 20 ? '✅ +5 Low reviews (growing)' : '— Established (20+ reviews)'}</div>
                      </div>
                      <div className="mt-2 pt-1 border-t border-slate-700 text-slate-400">Higher = better prospect</div>
                    </div>
                  </div>
                </td>
                <td className="py-3 px-4 text-slate-600">{prospect.email || 'N/A'}</td>
                <td className="py-3 px-4 text-slate-500">
                  {prospect.created_at ? new Date(prospect.created_at).toLocaleDateString() : '-'}
                </td>
              </tr>
              {expandedId === prospect.id && (
                <tr key={`${prospect.id}-detail`} className="bg-slate-50">
                  <td colSpan={6} className="px-4 py-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-slate-500">Phone:</span>{' '}
                        <span className="text-slate-900">{prospect.phone_raw || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Generated Site:</span>{' '}
                        <span className="text-slate-900">
                          {prospect.generated_site_url ? (
                            <a href={prospect.generated_site_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                              View Site
                            </a>
                          ) : 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">Owner:</span>{' '}
                        <span className="text-slate-900">{prospect.owner_name || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">QA Score:</span>{' '}
                        <span className="text-slate-900">{prospect.qa_score ?? 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Updated:</span>{' '}
                        <span className="text-slate-900">
                          {prospect.updated_at ? new Date(prospect.updated_at).toLocaleString() : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
      {prospects.length === 0 && (
        <div className="text-center py-12 text-slate-500">No prospects found</div>
      )}
    </div>
  );
}
