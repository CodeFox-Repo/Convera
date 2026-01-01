import { useEffect, useState } from "react";
import { Activity, BarChart3, Terminal } from "lucide-react";

interface UsageStats {
  total: {
    requests: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  recent: {
    requests: number;
    tokens: number;
  };
  byModel: Array<{
    modelId: string;
    requests: number;
    tokens: number;
  }>;
  daily: Array<{
    date: string;
    requests: number;
    tokens: number;
  }>;
}

interface RequestMatrixGraphProps {
  usageStats: UsageStats | null;
  loading?: boolean;
}

const generateMatrixData = (stats: UsageStats) => {
  const days = 7; // Reduce to 7 days (1 week)
  const hours = 12; // Reduce to 12 time slots (every 2 hours)
  const matrix: number[][] = [];
  
  // Create a 7x12 matrix (7 days, 12 time slots)
  for (let day = 0; day < days; day++) {
    matrix[day] = [];
    for (let timeSlot = 0; timeSlot < hours; timeSlot++) {
      // Simulate data based on stats, with some randomness for visual effect
      const baseIntensity = Math.random() * 0.3;
      const modelBoost = stats.byModel.length > 0 ? 0.2 : 0;
      const recentBoost = day < 3 ? stats.recent.requests / stats.total.requests * 0.4 : 0;
      
      matrix[day][timeSlot] = Math.min(1, baseIntensity + modelBoost + recentBoost + Math.random() * 0.3);
    }
  }
  
  return matrix;
};

const MatrixCell = ({ intensity, day, timeSlot }: { intensity: number; day: number; timeSlot: number }) => {
  const getColor = () => {
    if (intensity < 0.1) return "bg-zinc-900/20";
    if (intensity < 0.3) return "bg-orange-950/40";
    if (intensity < 0.5) return "bg-orange-900/60";
    if (intensity < 0.7) return "bg-orange-700/80";
    return "bg-orange-500";
  };

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const timeLabel = `${timeSlot * 2}:00-${(timeSlot * 2) + 2}:00`;

  return (
    <div
      className={`w-4 h-4 rounded-sm ${getColor()} transition-all duration-200 hover:scale-110 hover:bg-orange-400 cursor-pointer border border-zinc-800/50`}
      title={`${dayNames[day]}, ${timeLabel}: ${Math.round(intensity * 100)}% activity`}
    />
  );
};

export function RequestMatrixGraph({ usageStats, loading }: RequestMatrixGraphProps) {
  const [matrixData, setMatrixData] = useState<number[][]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    if (usageStats) {
      setMatrixData(generateMatrixData(usageStats));
    }
  }, [usageStats]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="bg-black/95 border border-orange-500/30 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <Terminal className="h-5 w-5 text-orange-400" />
          <h3 className="text-lg font-mono text-orange-200">REQUEST_MATRIX</h3>
          <div className="flex-1 h-px bg-gradient-to-r from-orange-500/50 to-transparent" />
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-orange-500 border-t-transparent" />
            <span className="text-orange-300/70 font-mono">LOADING_MATRIX_DATA...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!usageStats || usageStats.total.requests === 0) {
    return (
      <div className="bg-black/95 border border-orange-500/30 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <Terminal className="h-5 w-5 text-orange-400" />
          <h3 className="text-lg font-mono text-orange-200">REQUEST_MATRIX</h3>
          <div className="flex-1 h-px bg-gradient-to-r from-orange-500/50 to-transparent" />
          <span className="text-xs font-mono text-orange-400">[OFFLINE]</span>
        </div>
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-full bg-zinc-900/50 flex items-center justify-center mx-auto mb-4 border border-orange-500/20">
            <BarChart3 className="h-8 w-8 text-orange-300/50" />
          </div>
          <h4 className="font-mono text-orange-200 mb-2">NO_DATA_STREAM</h4>
          <p className="text-orange-300/70 text-sm font-mono">
            Initialize API requests to populate matrix
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-black/95 border border-orange-500/30 rounded-lg p-6 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Terminal className="h-5 w-5 text-orange-400" />
        <h3 className="text-lg font-mono text-orange-200">REQUEST_MATRIX</h3>
        <div className="flex-1 h-px bg-gradient-to-r from-orange-500/50 to-transparent" />
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-green-400 animate-pulse" />
          <span className="text-xs font-mono text-green-400">[ONLINE]</span>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-4 gap-4 mb-6 text-center">
        <div className="bg-zinc-900/50 border border-orange-500/20 rounded p-3">
          <div className="text-2xl font-mono font-bold text-orange-400">
            {usageStats.total.requests.toLocaleString()}
          </div>
          <div className="text-xs font-mono text-orange-200/60">TOTAL_REQ</div>
        </div>
        <div className="bg-zinc-900/50 border border-orange-500/20 rounded p-3">
          <div className="text-2xl font-mono font-bold text-orange-400">
            {Math.round(usageStats.total.totalTokens / 1000)}K
          </div>
          <div className="text-xs font-mono text-orange-200/60">TOKENS</div>
        </div>
        <div className="bg-zinc-900/50 border border-orange-500/20 rounded p-3">
          <div className="text-2xl font-mono font-bold text-orange-400">
            {usageStats.byModel.length}
          </div>
          <div className="text-xs font-mono text-orange-200/60">MODELS</div>
        </div>
        <div className="bg-zinc-900/50 border border-orange-500/20 rounded p-3">
          <div className="text-2xl font-mono font-bold text-orange-400">
            {usageStats.recent.requests}
          </div>
          <div className="text-xs font-mono text-orange-200/60">THIS_MONTH</div>
        </div>
      </div>

      {/* System Time */}
      <div className="flex items-center justify-between mb-4 text-xs font-mono">
        <span className="text-orange-300/70">
          SYS_TIME: {currentTime.toLocaleTimeString()} UTC{currentTime.getTimezoneOffset() / -60}
        </span>
        <span className="text-orange-300/70">
          MATRIX_SIZE: 7x12 | REFRESH: 1000ms
        </span>
      </div>

      {/* Matrix Visualization */}
      <div className="relative">
        {/* Time slot labels (every 2 hours) */}
        <div className="flex gap-2 mb-2 text-xs font-mono text-orange-300/60 pl-12">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="w-4 text-center">
              {i % 3 === 0 ? `${i * 2}h` : ''}
            </div>
          ))}
        </div>
        
        <div className="flex">
          {/* Day labels */}
          <div className="flex flex-col gap-2 mr-2 text-xs font-mono text-orange-300/60">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
              <div key={i} className="h-4 flex items-center justify-end w-8">
                {day}
              </div>
            ))}
          </div>
          
          {/* Matrix cells */}
          <div className="flex flex-col gap-2">
            {matrixData.map((row, dayIndex) => (
              <div key={dayIndex} className="flex gap-2">
                {row.map((intensity, timeSlotIndex) => (
                  <MatrixCell
                    key={`${dayIndex}-${timeSlotIndex}`}
                    intensity={intensity}
                    day={dayIndex}
                    timeSlot={timeSlotIndex}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-orange-500/20">
        <div className="flex items-center gap-2 text-xs font-mono text-orange-300/70">
          <span>INTENSITY:</span>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-zinc-900/20 rounded-sm" />
            <span>0%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-orange-950/40 rounded-sm" />
            <span>30%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-orange-700/80 rounded-sm" />
            <span>70%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-orange-500 rounded-sm" />
            <span>100%</span>
          </div>
        </div>
        <div className="text-xs font-mono text-orange-300/70">
          DAYS: {matrixData.length} | TIME_SLOTS: 12 | CELLS: {matrixData.length * 12}
        </div>
      </div>

      {/* Model Distribution */}
      {usageStats.byModel.length > 0 && (
        <div className="mt-4 pt-4 border-t border-orange-500/20">
          <div className="text-sm font-mono text-orange-200 mb-2">MODEL_DISTRIBUTION:</div>
          <div className="space-y-1">
            {usageStats.byModel.slice(0, 3).map((model) => (
              <div key={model.modelId} className="flex items-center justify-between text-xs font-mono">
                <span className="text-orange-300/70">
                  {model.modelId.toUpperCase().replace(/[^A-Z0-9]/g, '_')}
                </span>
                <span className="text-orange-400">{model.requests} req</span>
              </div>
            ))}
            {usageStats.byModel.length > 3 && (
              <div className="text-xs font-mono text-orange-300/50">
                ... +{usageStats.byModel.length - 3} more models
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}