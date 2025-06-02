import React from "react";
import { LogoImage } from "./Logo";

const HeroImage: React.FC = () => {
  return (
    <div className="bg-muted/50 relative h-[420px] w-full overflow-hidden rounded-lg md:h-[480px] lg:h-[520px] xl:h-[540px]">
      {/* App Window Frame */}
      <div className="bg-background absolute top-1/2 left-1/2 h-[90%] w-[90%] max-w-none -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border shadow-xl">
        {/* Window Top Bar */}
        <div className="bg-muted/80 flex h-9 items-center border-b px-4">
          <div className="flex space-x-2">
            <div className="h-3 w-3 rounded-full bg-red-500"></div>
            <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
            <div className="h-3 w-3 rounded-full bg-green-500"></div>
          </div>
          <div className="text-muted-foreground mx-auto text-xs">Foxychat</div>
        </div>

        {/* App Content */}
        <div className="flex h-[calc(100%-2.25rem)]">
          {/* Sidebar */}
          <div className="bg-muted/30 hidden w-16 border-r md:block md:w-64">
            <div className="p-4">
              <div className="bg-muted/60 mb-4 h-8 rounded-md"></div>
              <div className="space-y-2">
                <div className="bg-muted/60 h-6 w-3/4 rounded-md"></div>
                <div className="bg-muted/60 h-6 w-1/2 rounded-md"></div>
                <div className="bg-muted/60 h-6 w-2/3 rounded-md"></div>
              </div>
            </div>
          </div>

          {/* Chat Area */}
          <div className="flex flex-1 flex-col p-4">
            <div className="flex-1 overflow-hidden">
              {/* Chat Messages */}
              <div className="space-y-4">
                {/* User Message */}
                <div className="flex items-start justify-end">
                  <div className="bg-primary text-primary-foreground max-w-[80%] rounded-lg p-3">
                    <p className="text-sm">How can I improve my code's performance?</p>
                  </div>
                </div>

                {/* Foxychat Response */}
                <div className="flex items-start">
                  <div className="bg-primary/20 mr-2 flex h-8 w-8 items-center justify-center rounded-full">
                    <LogoImage height={32} width={32} />
                  </div>
                  <div className="bg-muted max-w-[80%] rounded-lg p-3">
                    <p className="text-sm">
                      I can help you optimize your code. Let's analyze what's causing the bottleneck
                      and explore solutions like memoization, lazy loading, or algorithm
                      improvements.
                    </p>
                  </div>
                </div>

                {/* Typing Indicator */}
                <div className="flex items-center">
                  <div className="bg-primary/20 mr-2 flex h-8 w-8 items-center justify-center rounded-full">
                    <LogoImage height={32} width={32} />
                  </div>
                  <div className="flex space-x-1">
                    <div className="bg-muted-foreground/30 h-2 w-2 animate-bounce rounded-full"></div>
                    <div
                      className="bg-muted-foreground/30 h-2 w-2 animate-bounce rounded-full"
                      style={{ animationDelay: "0.2s" }}
                    ></div>
                    <div
                      className="bg-muted-foreground/30 h-2 w-2 animate-bounce rounded-full"
                      style={{ animationDelay: "0.4s" }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Input Area */}
            <div className="mt-4 flex">
              <div className="bg-muted/50 flex flex-1 items-center rounded-lg border px-3 py-2">
                <div className="h-5 flex-1 bg-transparent"></div>
                <div className="bg-primary/20 flex h-6 w-6 items-center justify-center rounded-full">
                  <div className="bg-primary h-3 w-3 rounded-full"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HeroImage;
