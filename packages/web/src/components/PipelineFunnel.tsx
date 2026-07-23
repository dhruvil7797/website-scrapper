interface PipelineFunnelProps {
  stages: { stage: string; count: number }[];
}

const stageColors: Record<string, string> = {
  discovered: 'bg-slate-400',
  scraped: 'bg-slate-500',
  enriched: 'bg-blue-400',
  email_generated: 'bg-blue-500',
  approved: 'bg-indigo-500',
  sent: 'bg-purple-500',
  opened: 'bg-amber-500',
  clicked: 'bg-emerald-500',
  replied: 'bg-emerald-600',
};

const stageLabels: Record<string, string> = {
  discovered: 'Discovered',
  scraped: 'Scraped',
  enriched: 'Enriched',
  email_generated: 'Email Generated',
  approved: 'Approved',
  sent: 'Sent',
  opened: 'Opened',
  clicked: 'Clicked',
  replied: 'Replied',
};

export default function PipelineFunnel({ stages }: PipelineFunnelProps) {
  const maxCount = Math.max(...stages.map((s) => s.count), 1);

  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">Pipeline Funnel</h3>
      <div className="space-y-3">
        {stages.map(({ stage, count }) => {
          const width = Math.max((count / maxCount) * 100, 8);
          const color = stageColors[stage] || 'bg-slate-400';
          return (
            <div key={stage} className="flex items-center gap-3">
              <div className="w-32 text-sm text-slate-600 text-right shrink-0">
                {stageLabels[stage] || stage}
              </div>
              <div className="flex-1 relative">
                <div className="h-8 bg-slate-100 rounded-lg overflow-hidden">
                  <div
                    className={`h-full ${color} rounded-lg transition-all duration-500 flex items-center justify-end pr-3`}
                    style={{ width: `${width}%` }}
                  >
                    <span className="text-xs font-bold text-white drop-shadow-sm">
                      {count}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
