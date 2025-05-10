import React from 'react';
import Logo, { LogoImage } from './Logo';

const HeroImage: React.FC = () => {
  return (
    <div className="relative w-full h-[400px] md:h-[500px] overflow-hidden rounded-lg bg-muted/50">
      {/* App Window Frame */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-[800px] h-[80%] bg-background border rounded-xl shadow-xl overflow-hidden">
        {/* Window Top Bar */}
        <div className="h-9 bg-muted/80 border-b flex items-center px-4">
          <div className="flex space-x-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
          </div>
          <div className="text-xs text-muted-foreground mx-auto">Foxychat</div>
        </div>
        
        {/* App Content */}
        <div className="flex h-[calc(100%-2.25rem)]">
          {/* Sidebar */}
          <div className="w-16 md:w-64 bg-muted/30 border-r hidden md:block">
            <div className="p-4">
              <div className="h-8 bg-muted/60 rounded-md mb-4"></div>
              <div className="space-y-2">
                <div className="h-6 bg-muted/60 rounded-md w-3/4"></div>
                <div className="h-6 bg-muted/60 rounded-md w-1/2"></div>
                <div className="h-6 bg-muted/60 rounded-md w-2/3"></div>
              </div>
            </div>
          </div>
          
          {/* Chat Area */}
          <div className="flex-1 p-4 flex flex-col">
            <div className="flex-1 overflow-hidden">
              {/* Chat Messages */}
              <div className="space-y-4">
                {/* User Message */}
                <div className="flex items-start justify-end">
                  <div className="bg-primary text-primary-foreground rounded-lg p-3 max-w-[80%]">
                    <p className="text-sm">How can I improve my code's performance?</p>
                  </div>
                </div>
                
                {/* Foxychat Response */}
                <div className="flex items-start">
                  <div className="w-8 h-8 rounded-full bg-primary/20 mr-2 flex items-center justify-center">
                    <LogoImage height={32} width={32}/>
                  </div>
                  <div className="bg-muted rounded-lg p-3 max-w-[80%]">
                    <p className="text-sm">I can help you optimize your code. Let's analyze what's causing the bottleneck and explore solutions like memoization, lazy loading, or algorithm improvements.</p>
                  </div>
                </div>
                
                {/* Typing Indicator */}
                <div className="flex items-center">
                  <div className="w-8 h-8 rounded-full bg-primary/20 mr-2 flex items-center justify-center">
                    <LogoImage height={32} width={32}/>
                  </div>
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 rounded-full bg-muted-foreground/30 animate-bounce"></div>
                    <div className="w-2 h-2 rounded-full bg-muted-foreground/30 animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-2 h-2 rounded-full bg-muted-foreground/30 animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Input Area */}
            <div className="mt-4 flex">
              <div className="flex-1 bg-muted/50 border rounded-lg flex items-center px-3 py-2">
                <div className="flex-1 h-5 bg-transparent"></div>
                <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center">
                  <div className="w-3 h-3 bg-primary rounded-full"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Decorative Elements */}
      <div className="absolute -left-4 -bottom-4 w-32 h-32 bg-primary/20 rounded-full blur-xl"></div>
      <div className="absolute -right-4 -top-4 w-32 h-32 bg-primary/20 rounded-full blur-xl"></div>
    </div>
  );
};

export default HeroImage; 