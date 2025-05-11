import React from 'react';
import { Card } from '@/components/ui/card';
import { Terminal, Code, Sparkles } from 'lucide-react';

const FeaturesShowcase: React.FC = () => {
  return (
    <div className="relative overflow-hidden rounded-lg border bg-background shadow-lg">
      <div className="relative z-10 p-6 md:p-10">
        <h3 className="text-2xl font-bold mb-6">See What Foxychat Can Do</h3>
        
        <div className="grid gap-6">
          {/* Feature Item 1 */}
          <div className="flex items-start gap-4">
            <div className="bg-primary/10 p-2 rounded-lg">
              <Terminal className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h4 className="text-lg font-semibold mb-2">Advanced Command Detection</h4>
              <div className="relative overflow-hidden rounded bg-muted/80 p-2">
                <span className="font-mono text-sm opacity-90">
                  <span className="text-primary-foreground bg-primary px-1 rounded">$</span> foxychat restart nginx and update system packages
                </span>
                <div className="absolute top-0 left-0 h-full w-1 animate-pulse bg-primary"></div>
              </div>
            </div>
          </div>
          
          {/* Feature Item 2 */}
          <div className="flex items-start gap-4">
            <div className="bg-primary/10 p-2 rounded-lg">
              <Code className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h4 className="text-lg font-semibold mb-2">Code Assistance</h4>
              <Card className="p-2 text-sm font-mono overflow-hidden">
                <div className="flex gap-2">
                  <div className="text-muted-foreground select-none">1</div>
                  <div><span className="text-blue-500">function</span> <span className="text-yellow-500">optimizePerformance</span>(data) {'{'}</div>
                </div>
                <div className="flex gap-2">
                  <div className="text-muted-foreground select-none">2</div>
                  <div>&nbsp;&nbsp;<span className="text-purple-500">const</span> result = data.<span className="text-green-500">map</span>(<span className="text-blue-500">item</span> {'=> {'}</div>
                </div>
                <div className="flex gap-2 bg-green-500/10 rounded">
                  <div className="text-muted-foreground select-none">3</div>
                  <div>&nbsp;&nbsp;&nbsp;&nbsp;<span className="text-purple-500">return</span> <span className="text-blue-500">transform</span>(item);</div>
                </div>
                <div className="flex gap-2">
                  <div className="text-muted-foreground select-none">4</div>
                  <div>&nbsp;&nbsp;{'});'}</div>
                </div>
                <div className="flex gap-2">
                  <div className="text-muted-foreground select-none">5</div>
                  <div>&nbsp;&nbsp;<span className="text-purple-500">return</span> result;</div>
                </div>
                <div className="flex gap-2">
                  <div className="text-muted-foreground select-none">6</div>
                  <div>{'}'}</div>
                </div>
              </Card>
            </div>
          </div>
          
          {/* Feature Item 3 */}
          <div className="flex items-start gap-4">
            <div className="bg-primary/10 p-2 rounded-lg">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h4 className="text-lg font-semibold mb-2">Creative Assistant</h4>
              <div className="rounded bg-muted/50 p-3 relative">
                <p className="text-sm">
                  Generating social media post for your new product launch with eye-catching visuals and compelling copy...
                </p>
                <div className="mt-2 h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full animate-progress"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Background decoration */}
      <div className="absolute -right-20 -bottom-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl"></div>
      <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-primary/5 blur-3xl"></div>
    </div>
  );
};

export default FeaturesShowcase; 