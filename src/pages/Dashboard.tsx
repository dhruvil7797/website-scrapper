import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import type { DashboardStats, Campaign } from '@/types';

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  useEffect(() => {
    api.get<DashboardStats>('/stats').then(setStats).catch(console.error);
    api.get<Campaign[]>('/campaigns').then(setCampaigns).catch(console.error);
  }, []);

  if (!stats) return <div className="text-gray-400">Loading...</div>;

  const cards = [
    { label: 'Total Prospects', value: stats.total_prospects, icon: '👥' },
    { label: 'Campaigns', value: stats.total_campaigns, icon: '🎯' },
    { label: 'Emails This Week', value: stats.emails_this_week, icon: '📧' },
    { label: 'Avg Score', value: stats.avg_score, icon: '⭐' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{c.label}</p>
                <p className="text-2xl font-semibold text-gray-900 mt-1">{c.value}</p>
              </div>
              <span className="text-2xl">{c.icon}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status breakdown */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h2 className="font-medium text-gray-900 mb-4">Prospects by Status</h2>
          <div className="space-y-3">
            {Object.entries(stats.by_status).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between">
                <span className="text-sm text-gray-600 capitalize">{status}</span>
                <div className="flex items-center gap-3">
                  <div className="w-32 bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full"
                      style={{ width: `${stats.total_prospects ? (count / stats.total_prospects) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-900 w-8 text-right">{count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent campaigns */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-medium text-gray-900">Recent Campaigns</h2>
            <Link to="/campaigns" className="text-sm text-blue-600 hover:text-blue-700">
              View all →
            </Link>
          </div>
          {campaigns.length === 0 ? (
            <p className="text-sm text-gray-400">No campaigns yet</p>
          ) : (
            <div className="space-y-3">
              {campaigns.slice(0, 5).map((c) => (
                <div key={c.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{c.name}</p>
                    <p className="text-xs text-gray-500">{c.location} · {c.niche_name || c.niche_id}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{c.discovered_count}/{c.requested_count}</p>
                    <p className={`text-xs ${c.status === 'completed' ? 'text-green-600' : c.status === 'running' ? 'text-blue-600' : 'text-gray-400'}`}>
                      {c.status}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <Link to="/campaigns" className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700">
          + New Campaign
        </Link>
        <Link to="/prospects" className="bg-white text-gray-700 px-4 py-2 rounded-md text-sm font-medium border border-gray-300 hover:bg-gray-50">
          View Prospects
        </Link>
      </div>
    </div>
  );
}
