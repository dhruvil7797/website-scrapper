import { useEffect, useState, useCallback } from 'react';
import { Mail, MousePointer, Eye, TrendingUp, Calendar } from 'lucide-react';
import api from '../lib/api';
import StatsCard from '../components/StatsCard';
import PipelineFunnel from '../components/PipelineFunnel';

function toISODate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getToday(): string {
  return toISODate(new Date());
}

function getDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toISODate(d);
}

type QuickRange = 'today' | '7d' | '30d' | 'all';

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState(getToday());
  const [toDate, setToDate] = useState(getToday());
  const [activeRange, setActiveRange] = useState<QuickRange>('today');

  const fetchStats = useCallback((from?: string, to?: string) => {
    setLoading(true);
    const params = activeRange === 'all' && !from && !to
      ? undefined
      : { from: from || fromDate, to: to || toDate };
    api.getStats(params)
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [fromDate, toDate, activeRange]);

  useEffect(() => {
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyQuickRange = (range: QuickRange) => {
    setActiveRange(range);
    let from: string | undefined;
    let to: string | undefined;

    if (range === 'today') {
      from = getToday();
      to = getToday();
      setFromDate(from);
      setToDate(to);
    } else if (range === '7d') {
      from = getDaysAgo(7);
      to = getToday();
      setFromDate(from);
      setToDate(to);
    } else if (range === '30d') {
      from = getDaysAgo(30);
      to = getToday();
      setFromDate(from);
      setToDate(to);
    } else {
      // all time
      setFromDate('');
      setToDate('');
    }

    setLoading(true);
    api.getStats(range === 'all' ? undefined : { from: from!, to: to! })
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const handleDateChange = (newFrom: string, newTo: string) => {
    setFromDate(newFrom);
    setToDate(newTo);
    setActiveRange('today'); // deselect quick-select pills
    setLoading(true);
    const params = newFrom || newTo ? { from: newFrom, to: newTo } : undefined;
    api.getStats(params)
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const pillClass = (range: QuickRange) =>
    `px-3 py-1 text-xs font-medium rounded-full cursor-pointer transition-colors ${
      activeRange === range
        ? 'bg-green-600 text-white'
        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
    }`;

  // Determine label for sends card
  const sendsLabel = activeRange === 'today' ? 'Emails Today'
    : activeRange === '7d' ? 'Emails (7d)'
    : activeRange === '30d' ? 'Emails (30d)'
    : 'Total Emails';

  if (!stats && !loading) {
    return <div className="text-center py-12 text-slate-500">Failed to load dashboard data</div>;
  }

  const pipeline = stats?.pipeline || {};
  const pipelineStages = Object.entries(pipeline).map(([stage, count]) => ({
    stage,
    count: count as number,
  }));
  const totalProspects = stats?.total || pipelineStages.reduce((sum, s) => sum + (s.count || 0), 0);
  const engagement = stats?.engagement || {};
  const todaySends = stats?.todaySends || 0;
  const activeCampaigns = stats?.activeCampaigns || 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Dashboard</h2>
        <p className="text-slate-500 mt-1">Pipeline overview and email performance</p>
      </div>

      {/* Date Range Filter */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Calendar size={16} className="text-slate-500" />
          <span className="text-sm font-medium text-slate-700">Date Range</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => handleDateChange(e.target.value, toDate)}
              className="px-2 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => handleDateChange(fromDate, e.target.value)}
              className="px-2 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <button className={pillClass('today')} onClick={() => applyQuickRange('today')}>Today</button>
          <button className={pillClass('7d')} onClick={() => applyQuickRange('7d')}>Last 7 days</button>
          <button className={pillClass('30d')} onClick={() => applyQuickRange('30d')}>Last 30 days</button>
          <button className={pillClass('all')} onClick={() => applyQuickRange('all')}>All time</button>
        </div>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin w-6 h-6 border-4 border-green-600 border-t-transparent rounded-full" />
        </div>
      )}

      {!loading && stats && (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard
              title={sendsLabel}
              value={todaySends}
              subtitle={`Email cap: ${stats?.rampLimit || 10}/day (Ramp level ${stats?.rampLevel || 0})`}
              icon={<Mail size={20} />}
              color="blue"
            />
            <StatsCard
              title="Open Rate"
              value={`${engagement.openRate || 0}%`}
              subtitle={`${engagement.opened || 0} opened`}
              icon={<Eye size={20} />}
              color="green"
            />
            <StatsCard
              title="Click Rate"
              value={`${engagement.clickRate || 0}%`}
              subtitle={`${engagement.clicked || 0} clicked`}
              icon={<MousePointer size={20} />}
              color="purple"
            />
            <StatsCard
              title="Total Pipeline"
              value={totalProspects}
              subtitle={`${engagement.emailed || 0} emailed`}
              icon={<TrendingUp size={20} />}
              color="amber"
            />
          </div>

          {/* Pipeline Funnel */}
          {pipelineStages.length > 0 && <PipelineFunnel stages={pipelineStages} />}

          {/* Engagement Summary */}
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Engagement Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-slate-900">{engagement.emailed || 0}</div>
                <div className="text-xs text-slate-500 mt-1">Total Emailed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-slate-900">{engagement.opened || 0}</div>
                <div className="text-xs text-slate-500 mt-1">Opened</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-slate-900">{engagement.clicked || 0}</div>
                <div className="text-xs text-slate-500 mt-1">Clicked</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-slate-900">{engagement.replied || 0}</div>
                <div className="text-xs text-slate-500 mt-1">Replied</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
