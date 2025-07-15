import { BarChart3 } from "lucide-react";
import React from "react";
import { UsageStats } from "@/renderer/libs/hooks/use-usage-stats";

interface UsageStatsSectionProps {
  usageStats: UsageStats | null;
  loadingStats: boolean;
  formatNumber: (num: number) => string;
}

export function UsageStatsSection({
  usageStats,
  loadingStats,
  formatNumber,
}: UsageStatsSectionProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium text-foreground">
        Usage Statistics
      </h2>

      {loadingStats ? (
        <div className="p-4 border border-border rounded-lg">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent mr-3"></div>
            <span className="text-muted-foreground">
              Loading usage statistics...
            </span>
          </div>
        </div>
      ) : usageStats && usageStats.total.requests > 0 ? (
        <div className="p-4 border border-border rounded-lg">
          <div className="grid grid-cols-2 gap-8">
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">
                {formatNumber(usageStats.total.requests)}
              </div>
              <div className="text-sm text-muted-foreground">
                Total Requests
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {formatNumber(usageStats.recent.requests)} this month
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">
                {formatNumber(usageStats.total.totalTokens)}
              </div>
              <div className="text-sm text-muted-foreground">
                Total Tokens
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {formatNumber(usageStats.recent.tokens)} this month
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 border border-border rounded-lg">
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
              <BarChart3 className="h-6 w-6 text-muted-foreground" />
            </div>
            <h4 className="font-medium text-foreground mb-1">
              No Usage Data Yet
            </h4>
            <p className="text-muted-foreground text-sm">
              Start using remote servers to see your usage statistics here.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}