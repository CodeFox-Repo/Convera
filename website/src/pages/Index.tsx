import HeroImage from "@/components/HeroImage";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ChevronLeft,
  ChevronRight,
  Download
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

const Index = () => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  // Smooth infinite scroll effect
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    let animationId: number;
    const scrollSpeed = 0.5; // pixels per frame

    const smoothScroll = () => {
      if (!isHovered && container) {
        container.scrollLeft += scrollSpeed;

        // Reset to beginning when we've scrolled halfway (one complete set)
        const maxScroll = container.scrollWidth / 2;
        if (container.scrollLeft >= maxScroll) {
          container.scrollLeft = 0;
        }
      }
      animationId = requestAnimationFrame(smoothScroll);
    };

    animationId = requestAnimationFrame(smoothScroll);

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [isHovered]);

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const cardWidth = 96 + 16; // w-24 (96px) + gap (16px)
      const scrollAmount = cardWidth * 4; // Scroll 4 cards at a time
      const maxScroll = container.scrollWidth / 2;

      // Temporarily stop auto-scroll
      setIsHovered(true);

      if (container.scrollLeft <= 0) {
        // If at the beginning, jump to near the end
        container.scrollLeft = maxScroll - scrollAmount;
      } else {
        container.scrollBy({ left: -scrollAmount, behavior: "smooth" });
      }

      // Resume auto-scroll after a delay
      setTimeout(() => setIsHovered(false), 2000);
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const cardWidth = 96 + 16; // w-24 (96px) + gap (16px)
      const scrollAmount = cardWidth * 4; // Scroll 4 cards at a time
      const maxScroll = container.scrollWidth / 2;

      // Temporarily stop auto-scroll
      setIsHovered(true);

      if (container.scrollLeft >= maxScroll - 50) {
        // If near the end, jump to the beginning
        container.scrollLeft = 0;
      } else {
        container.scrollBy({ left: scrollAmount, behavior: "smooth" });
      }

      // Resume auto-scroll after a delay
      setTimeout(() => setIsHovered(false), 2000);
    }
  };

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <Navbar />

      {/* Hero Section */}
      <section className="relative w-full overflow-hidden bg-gradient-to-br from-white via-orange-50/40 to-orange-100/60 py-16 md:py-24 lg:py-32">
        {/* Subtle Background Accent */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-orange-200/20 to-transparent"></div>
        <div className="absolute top-0 right-0 h-full w-1/3 bg-gradient-to-l from-orange-100/30 to-transparent"></div>

        <div className="relative z-10 container mx-auto px-4 md:px-6 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[1fr_1.5fr] lg:gap-16 xl:gap-24">
            {/* Left side - Content */}
            <div className="space-y-8 lg:space-y-10">
              <h1
                className="bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-5xl md:text-6xl lg:text-5xl xl:text-6xl"
                style={{
                  backgroundImage:
                    "linear-gradient(to right, rgb(30 41 59) 0%, rgb(30 41 59) 30%, rgb(251 146 60) 50%, rgb(251 146 60) 100%)",
                }}
              >
                Your AI Desktop Companion
              </h1>
              <p className="text-muted-foreground max-w-[500px] text-lg leading-relaxed font-medium md:text-xl">
                Your personal desktop AI assistant that leverages{" "}
                <span className="font-semibold text-orange-500">
                  
Model Context Protocol (MCP)
                </span>{" "}
                to understand your workflows and automate repetitive tasks intelligently.
              </p>
              <div className="flex flex-col gap-4 pt-2 sm:flex-row sm:gap-6">
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-orange-500 to-orange-400 px-8 py-3 text-base font-semibold shadow-lg transition-all duration-300 hover:from-orange-600 hover:to-orange-500 hover:shadow-orange-400/30"
                  asChild
                >
                  <Link to="/download">
                    Download Latest Version
                    <Download className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>

            {/* Right side - Hero Image */}
            <div className="mt-8 flex justify-center lg:mt-0 lg:justify-end">
              <div className="min-h-96 w-full lg:min-h-[28rem] xl:min-h-[32rem]">
                <HeroImage />
              </div>
            </div>
          </div>
        </div>
      </section>
      
      {/* Start demo section */}
      {/* Benefits Section */}
      <section id="demo" className="w-full py-16 md:py-24">
        <div className="container mx-auto max-w-6xl px-4 md:px-6">
          {/* Centered heading */}
          <div className="text-center mb-16">
            <h2 className="mb-6 text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
              Collaborate on your Computer
            </h2>
            <p className="text-muted-foreground text-lg leading-relaxed md:text-xl text-center max-w-2xl mx-auto">
              Foxychat simplifies your daily computer interactions with AI.
            </p>
          </div>

          {/* Workflow comparison - centered */}
          <div className="flex justify-center mb-16">
            <div className="bg-muted/20 space-y-6 rounded-xl p-8 md:p-10 max-w-2xl w-full border border-muted/30">
              <div className="space-y-3">
                <div className="text-muted-foreground text-sm font-medium">Instead of:</div>
                <div className="font-mono text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                  1. Open browser → 2. Copy → 3. Change tab → 4. Paste → 5. Ask
                </div>
              </div>
              <div className="space-y-3">
                <div className="text-muted-foreground text-sm font-medium">Now Simply Do:</div>
                <div className="font-mono text-sm text-green-600 bg-green-50 p-3 rounded-lg">
                  "1. Shortcut → 2. Ask"
                </div>
              </div>
            </div>
          </div>

          {/* Demo Video Section */}
          <div className="text-center">
            <div className="mx-auto max-w-2xl">
              <div className="relative overflow-hidden rounded-xl bg-gray-100 shadow-2xl">
                <div className="aspect-video w-full">
                  {/* Placeholder for demo video */}
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-orange-100 to-orange-200">
                    <div className="text-center space-y-4">
                      <div className="mx-auto h-12 w-12 rounded-full bg-orange-500 flex items-center justify-center">
                        <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                      </div>
                      <p className="text-gray-600 font-medium">Demo Video Coming Soon</p>
                      <p className="text-gray-500 text-sm">Watch how Foxychat transforms your workflow</p>
                    </div>
                  </div>
                  {/* Uncomment and replace with actual video when ready */}
                  {/* 
                  <video 
                    className="h-full w-full object-cover" 
                    controls 
                    poster="/path-to-video-thumbnail.jpg"
                  >
                    <source src="/path-to-demo-video.mp4" type="video/mp4" />
                    Your browser does not support the video tag.
                  </video> 
                  */}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Does a Lot More Than chat Section */}
      <section className="w-full py-16 md:py-24 bg-gradient-to-b to-transparent">
        <div className="container mx-auto max-w-6xl px-4 md:px-6">
          <div className="text-center mb-16">
            <h2 className="mb-6 text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
              Does a Lot More Than Chat
            </h2>
            <p className="text-muted-foreground mx-auto max-w-2xl text-lg md:text-xl">
              Foxychat goes beyond simple conversations to become your intelligent desktop companion
            </p>
          </div>

          {/* Small Demo Video */}
          <div className="mb-16 flex justify-center">
            <div className="max-w-2xl w-full">
              <div className="relative overflow-hidden rounded-xl bg-white shadow-lg border border-orange-100">
                <div className="aspect-video w-full">
                  {/* Placeholder for small demo video */}
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-orange-50 to-orange-100">
                    <div className="text-center space-y-3">
                      <div className="mx-auto h-10 w-10 rounded-full bg-orange-500 flex items-center justify-center">
                        <svg className="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                      </div>
                      <p className="text-gray-600 font-medium text-sm">Feature Demo Video</p>
                    </div>
                  </div>
                  {/* Uncomment and replace with actual video when ready */}
                  {/* 
                  <video 
                    className="h-full w-full object-cover" 
                    controls 
                    poster="/path-to-feature-demo-thumbnail.jpg"
                  >
                    <source src="/path-to-feature-demo-video.mp4" type="video/mp4" />
                    Your browser does not support the video tag.
                  </video> 
                  */}
                </div>
              </div>
            </div>
          </div>
          
          {/* Feature grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center space-y-4 p-6 rounded-lg hover:bg-muted/20 transition-colors">
              <div className="bg-orange-100 rounded-full w-12 h-12 flex items-center justify-center mx-auto">
                <span className="text-orange-600 text-lg">🔧</span>
              </div>
              <h4 className="text-xl font-semibold">Integrate with your favorite app</h4>
              <p className="text-muted-foreground">
                Integrate with your favorite app and use it with Foxychat through MCP Server
              </p>
            </div>
            
            <div className="text-center space-y-4 p-6 rounded-lg hover:bg-muted/20 transition-colors">
              <div className="bg-orange-100 rounded-full w-12 h-12 flex items-center justify-center mx-auto">
                <span className="text-orange-600 text-lg">🧠</span>
              </div>
              <h4 className="text-xl font-semibold">Context Awareness</h4>
              <p className="text-muted-foreground">
                Understands what you're working on and provides relevant assistance
              </p>
            </div>
            
            <div className="text-center space-y-4 p-6 rounded-lg hover:bg-muted/20 transition-colors">
              <div className="bg-orange-100 rounded-full w-12 h-12 flex items-center justify-center mx-auto">
                <span className="text-orange-600 text-lg">⚡</span>
              </div>
              <h4 className="text-xl font-semibold">Instant Actions</h4>
              <p className="text-muted-foreground">
                Execute complex operations with simple text commands
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Build Your Own Agent Section */}
      <section className="w-full py-16 md:py-24 bg-gradient-to-b to-transparent">
        <div className="container mx-auto max-w-6xl px-4 md:px-6">
          <div className="text-center mb-16">
            <h2 className="mb-6 text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
              Build Your Own Agent
            </h2>
            <p className="text-muted-foreground mx-auto max-w-2xl text-lg md:text-xl">
              Create custom AI agents tailored to your specific workflows and integrate them seamlessly with Foxychat
            </p>
          </div>

          {/* Agent Builder Demo Video */}
          <div className="mb-16 flex justify-center">
            <div className="max-w-2xl w-full">
              <div className="relative overflow-hidden rounded-xl bg-white shadow-lg border border-blue-100">
                <div className="aspect-video w-full">
                  {/* Placeholder for agent builder demo video */}
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100">
                    <div className="text-center space-y-4">
                      <div className="mx-auto h-12 w-12 rounded-full bg-blue-500 flex items-center justify-center">
                        <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                      </div>
                      <p className="text-gray-600 font-medium">Agent Builder Demo</p>
                      <p className="text-gray-500 text-sm">See how to create your custom AI agent</p>
                    </div>
                  </div>
                  {/* Uncomment and replace with actual video when ready */}
                  {/* 
                  <video 
                    className="h-full w-full object-cover" 
                    controls 
                    poster="/path-to-agent-builder-thumbnail.jpg"
                  >
                    <source src="/path-to-agent-builder-video.mp4" type="video/mp4" />
                    Your browser does not support the video tag.
                  </video> 
                  */}
                </div>
              </div>
            </div>
          </div>

          {/* Agent Building Features */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <div className="text-center space-y-4 p-8 rounded-lg hover:bg-muted/20 transition-colors">
              <div className="bg-blue-100 rounded-full w-12 h-12 flex items-center justify-center mx-auto">
                <span className="text-blue-600 text-lg">🛠️</span>
              </div>
              <h4 className="text-xl font-semibold">No-Code Builder</h4>
              <p className="text-muted-foreground">
                Create powerful agents without writing a single line of code using our intuitive visual builder
              </p>
            </div>
            
            <div className="text-center space-y-4 p-8 rounded-lg hover:bg-muted/20 transition-colors">
              <div className="bg-blue-100 rounded-full w-12 h-12 flex items-center justify-center mx-auto">
                <span className="text-blue-600 text-lg">🔗</span>
              </div>
              <h4 className="text-xl font-semibold">MCP Integration</h4>
              <p className="text-muted-foreground">
                Leverage Model Context Protocol to connect your agents with any application or service
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Apps We Support Section */}
      <section className="w-full py-12 md:py-16">
        <div className="container mx-auto max-w-6xl px-4 md:px-6">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
              Apps We Support
            </h2>
            <p className="text-muted-foreground mx-auto max-w-[600px] text-lg md:text-xl">
              Foxychat's MCP integrates seamlessly with your favorite productivity tools
            </p>
          </div>

          <div className="relative">
            {/* Left Arrow Button */}
            <Button
              variant="outline"
              size="icon"
              className="bg-background/90 border-muted hover:bg-muted absolute top-1/2 left-0 z-10 -translate-y-1/2 shadow-md backdrop-blur-sm"
              onClick={scrollLeft}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            {/* Right Arrow Button */}
            <Button
              variant="outline"
              size="icon"
              className="bg-background/90 border-muted hover:bg-muted absolute top-1/2 right-0 z-10 -translate-y-1/2 shadow-md backdrop-blur-sm"
              onClick={scrollRight}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            <div className="mx-12 overflow-hidden">
              <div
                ref={scrollContainerRef}
                className="scrollbar-hide flex space-x-4 overflow-x-auto px-2"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
              >
                {[
                  // First set
                  {
                    name: "VS Code",
                    logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/vscode/vscode-original.svg",
                  },
                  {
                    name: "Chrome",
                    logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/chrome/chrome-original.svg",
                  },
                  { name: "Notion", logo: "https://www.notion.so/images/favicon.ico" },
                  {
                    name: "Slack",
                    logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/slack/slack-original.svg",
                  },
                  {
                    name: "Discord",
                    logo: "https://assets-global.website-files.com/6257adef93867e50d84d30e2/636e0a6a49cf127bf92de1e2_icon_clyde_blurple_RGB.png",
                  },
                  {
                    name: "Figma",
                    logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/figma/figma-original.svg",
                  },
                  {
                    name: "Excel",
                    logo: "https://img.icons8.com/color/48/microsoft-excel-2019.png",
                  },
                  { name: "Word", logo: "https://img.icons8.com/color/48/microsoft-word-2019.png" },
                  {
                    name: "GitHub",
                    logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/github/github-original.svg",
                  },
                  {
                    name: "Jira",
                    logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/jira/jira-original.svg",
                  },
                  {
                    name: "Obsidian",
                    logo: "https://obsidian.md/images/obsidian-logo-gradient.svg",
                  },
                  { name: "Terminal", logo: "https://img.icons8.com/color/48/terminal.png" },
                  {
                    name: "Photoshop",
                    logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/photoshop/photoshop-original.svg",
                  },
                  // Second set - exact duplicate for seamless loop
                  {
                    name: "VS Code",
                    logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/vscode/vscode-original.svg",
                  },
                  {
                    name: "Chrome",
                    logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/chrome/chrome-original.svg",
                  },
                  { name: "Notion", logo: "https://www.notion.so/images/favicon.ico" },
                  {
                    name: "Slack",
                    logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/slack/slack-original.svg",
                  },
                  {
                    name: "Discord",
                    logo: "https://assets-global.website-files.com/6257adef93867e50d84d30e2/636e0a6a49cf127bf92de1e2_icon_clyde_blurple_RGB.png",
                  },
                  {
                    name: "Figma",
                    logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/figma/figma-original.svg",
                  },
                  {
                    name: "Excel",
                    logo: "https://img.icons8.com/color/48/microsoft-excel-2019.png",
                  },
                  { name: "Word", logo: "https://img.icons8.com/color/48/microsoft-word-2019.png" },
                  {
                    name: "GitHub",
                    logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/github/github-original.svg",
                  },
                  {
                    name: "Jira",
                    logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/jira/jira-original.svg",
                  },
                  {
                    name: "Obsidian",
                    logo: "https://obsidian.md/images/obsidian-logo-gradient.svg",
                  },
                  { name: "Terminal", logo: "https://img.icons8.com/color/48/terminal.png" },
                  {
                    name: "Photoshop",
                    logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/photoshop/photoshop-original.svg",
                  },
                ].map((app, index) => (
                  <Card
                    key={index}
                    className="bg-background w-20 flex-shrink-0 border-0 shadow-sm transition-all duration-200 hover:scale-105 hover:shadow-md"
                  >
                    <CardContent className="flex flex-col items-center space-y-2 p-3">
                      <div className="flex h-6 w-6 items-center justify-center">
                        <img
                          src={app.logo}
                          alt={app.name}
                          className="h-6 w-6 object-contain"
                          onError={(e) => {
                            const target = e.currentTarget;
                            const nextElement = target.nextElementSibling as HTMLElement;
                            target.style.display = "none";
                            if (nextElement) {
                              nextElement.style.display = "flex";
                            }
                          }}
                        />
                        <div className="bg-muted flex hidden h-6 w-6 items-center justify-center rounded text-xs">
                          {app.name.slice(0, 2)}
                        </div>
                      </div>
                      <span className="text-muted-foreground text-center text-xs font-medium">
                        {app.name}
                      </span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12">
        <div className="container mx-auto max-w-6xl px-4 md:px-6">
          <div className="text-muted-foreground text-center">
            <p>&copy; 2025 Foxychat</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
