import Footer from "@/components/Footer";
import HeroImage from "@/components/HeroImage";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ChevronLeft,
  ChevronRight,
  Code,
  Download,
  FileText,
  Palette,
  Table
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  siDiscord,
  siFigma,
  siGithub,
  siGnubash,
  siGooglechrome,
  siJira,
  siNotion,
  siObsidian,
  siSlack
} from "simple-icons";

const Index = () => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isVisible, setIsVisible] = useState({
    hero: false,
    apps: false,
    demo: false,
    features: false,
    agent: false,
  });

  // Intersection Observer for scroll animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const target = entry.target.getAttribute('data-section');
            if (target) {
              setIsVisible(prev => ({ ...prev, [target]: true }));
            }
          }
        });
      },
      { threshold: 0.1 }
    );

    const sections = document.querySelectorAll('[data-section]');
    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, []);

  // Add custom CSS animations
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeInUp {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      @keyframes slideInFromLeft {
        from {
          opacity: 0;
          transform: translateX(-30px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }
      
      @keyframes slideInFromRight {
        from {
          opacity: 0;
          transform: translateX(30px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }
      
      .animate-fadeInUp {
        animation: fadeInUp 0.6s ease-out both;
      }
      
      .animate-slideInLeft {
        animation: slideInFromLeft 0.6s ease-out both;
      }
      
      .animate-slideInRight {
        animation: slideInFromRight 0.6s ease-out both;
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Smooth infinite scroll effect
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    let animationId: number;
    const scrollSpeed = 0.5;

    const smoothScroll = () => {
      if (!isHovered && container) {
        container.scrollLeft += scrollSpeed;
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
      const cardWidth = 96 + 16;
      const scrollAmount = cardWidth * 4;
      const maxScroll = container.scrollWidth / 2;

      setIsHovered(true);

      if (container.scrollLeft <= 0) {
        container.scrollLeft = maxScroll - scrollAmount;
      } else {
        container.scrollBy({ left: -scrollAmount, behavior: "smooth" });
      }

      setTimeout(() => setIsHovered(false), 2000);
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const cardWidth = 96 + 16;
      const scrollAmount = cardWidth * 4;
      const maxScroll = container.scrollWidth / 2;

      setIsHovered(true);

      if (container.scrollLeft >= maxScroll - 50) {
        container.scrollLeft = 0;
      } else {
        container.scrollBy({ left: scrollAmount, behavior: "smooth" });
      }

      setTimeout(() => setIsHovered(false), 2000);
    }
  };

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <Navbar />

      {/* Hero Section */}
      <section 
        className="relative w-full overflow-hidden bg-gradient-to-br from-white via-orange-50/30 to-orange-100/50 py-20 md:py-28 pt-28 md:pt-36"
        data-section="hero"
      >
        {/* Animated background elements */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-orange-200/10 to-transparent animate-pulse"></div>
        <div className="absolute top-0 right-0 h-full w-1/3 bg-gradient-to-l from-orange-100/20 to-transparent"></div>
        <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-orange-200/8 rounded-full blur-xl animate-bounce" style={{ animationDuration: '3s' }}></div>
        <div className="absolute bottom-1/3 right-1/4 w-48 h-48 bg-orange-100/12 rounded-full blur-2xl animate-pulse" style={{ animationDuration: '4s' }}></div>

        <div className="relative z-10 container mx-auto px-4 md:px-6 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-[1fr_1.5fr] lg:gap-20 xl:gap-24 mb-20">
            {/* Left side - Content with stagger animation */}
            <div className={`space-y-8 lg:space-y-10 transition-all duration-1000 ${isVisible.hero ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
              <h1
                className={`bg-clip-text text-5xl font-bold tracking-tight text-transparent sm:text-6xl md:text-7xl lg:text-6xl xl:text-7xl leading-tight transition-all duration-1200 delay-200 ${isVisible.hero ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
                style={{
                  backgroundImage:
                    "linear-gradient(to right, rgb(30 41 59) 0%, rgb(30 41 59) 30%, rgb(251 146 60) 50%, rgb(251 146 60) 100%)",
                }}
              >
                Your AI Desktop Companion
              </h1>
              <p className={`text-muted-foreground max-w-[520px] text-xl leading-relaxed font-medium md:text-2xl transition-all duration-1000 delay-400 ${isVisible.hero ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                Your personal desktop AI assistant that leverages{" "}
                <span className="font-semibold text-orange-600">
                  Model Context Protocol (MCP)
                </span>{" "}
                to understand your workflows and automate repetitive tasks intelligently.
              </p>
              <div className={`flex flex-col gap-4 pt-4 sm:flex-row sm:gap-6 transition-all duration-1000 delay-600 ${isVisible.hero ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-orange-500 to-orange-400 px-10 py-4 text-lg font-semibold shadow-xl transition-all duration-300 hover:from-orange-600 hover:to-orange-500 hover:shadow-orange-400/40 hover:scale-105 transform animate-pulse hover:animate-none"
                  style={{ animationDuration: '2s' }}
                  asChild
                >
                  <Link to="/download">
                    Download Latest Version
                    <Download className="ml-3 h-5 w-5" />
                  </Link>
                </Button>
              </div>
            </div>

            {/* Right side - Hero Image with entrance animation */}
            <div className={`mt-8 flex justify-center lg:mt-0 lg:justify-end transition-all duration-1200 delay-300 ${isVisible.hero ? 'opacity-100 translate-x-0 scale-100' : 'opacity-0 translate-x-8 scale-95'}`}>
              <div className="min-h-[32rem] w-full lg:min-h-[36rem] xl:min-h-[40rem] transform hover:scale-105 transition-transform duration-500">
                <HeroImage />
              </div>
            </div>
          </div>

          {/* Integrated Apps Support Section with stagger animation */}
          <div 
            className={`space-y-8 md:space-y-12 transition-all duration-1000 delay-800 ${isVisible.hero ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
            data-section="apps"
          >
            <div className="text-center">
              <p className="text-muted-foreground mx-auto max-w-[600px] text-lg md:text-xl font-medium">
                Foxychat's MCP integrates seamlessly with your favorite productivity tools
              </p>
            </div>

            <div className="relative">
              {/* Enhanced arrow buttons */}
              <Button
                variant="outline"
                size="icon"
                className="bg-white/90 border-orange-200 hover:bg-orange-50 hover:border-orange-300 absolute top-1/2 left-0 z-10 -translate-y-1/2 shadow-lg backdrop-blur-sm transition-all duration-200 hover:scale-110"
                onClick={scrollLeft}
              >
                <ChevronLeft className="h-4 w-4 text-orange-600" />
              </Button>

              <Button
                variant="outline"
                size="icon"
                className="bg-white/90 border-orange-200 hover:bg-orange-50 hover:border-orange-300 absolute top-1/2 right-0 z-10 -translate-y-1/2 shadow-lg backdrop-blur-sm transition-all duration-200 hover:scale-110"
                onClick={scrollRight}
              >
                <ChevronRight className="h-4 w-4 text-orange-600" />
              </Button>

              <div className="mx-12 overflow-hidden">
                <div
                  ref={scrollContainerRef}
                  className="scrollbar-hide flex space-x-4 overflow-x-auto px-2 py-4"
                  style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                  onMouseEnter={() => setIsHovered(true)}
                  onMouseLeave={() => setIsHovered(false)}
                >
                  {[
                    // App icons data
                    { name: "VS Code", icon: Code, isLucide: true },
                    { name: "Chrome", logo: siGooglechrome.svg },
                    { name: "Notion", logo: siNotion.svg },
                    { name: "Slack", logo: siSlack.svg },
                    { name: "Discord", logo: siDiscord.svg },
                    { name: "Figma", logo: siFigma.svg },
                    { name: "Excel", icon: Table, isLucide: true },
                    { name: "Word", icon: FileText, isLucide: true },
                    { name: "GitHub", logo: siGithub.svg },
                    { name: "Jira", logo: siJira.svg },
                    { name: "Obsidian", logo: siObsidian.svg },
                    { name: "Terminal", logo: siGnubash.svg },
                    { name: "Photoshop", icon: Palette, isLucide: true },
                    // Duplicate set for seamless loop
                    { name: "VS Code", icon: Code, isLucide: true },
                    { name: "Chrome", logo: siGooglechrome.svg },
                    { name: "Notion", logo: siNotion.svg },
                    { name: "Slack", logo: siSlack.svg },
                    { name: "Discord", logo: siDiscord.svg },
                    { name: "Figma", logo: siFigma.svg },
                    { name: "Excel", icon: Table, isLucide: true },
                    { name: "Word", icon: FileText, isLucide: true },
                    { name: "GitHub", logo: siGithub.svg },
                    { name: "Jira", logo: siJira.svg },
                    { name: "Obsidian", logo: siObsidian.svg },
                    { name: "Terminal", logo: siGnubash.svg },
                    { name: "Photoshop", icon: Palette, isLucide: true },
                  ].map((app, index) => (
                    <Card
                      key={index}
                      className={`bg-white/90 backdrop-blur-sm w-24 h-24 flex-shrink-0 border border-orange-100/60 shadow-md transition-all duration-300 hover:scale-110 hover:shadow-lg hover:bg-white hover:border-orange-200 group ${isVisible.apps ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
                      style={{ 
                        transitionDelay: `${(index % 13) * 100}ms`,
                        animation: isVisible.apps ? `fadeInUp 0.6s ease-out ${(index % 13) * 100}ms both` : 'none'
                      }}
                    >
                      <CardContent className="flex flex-col items-center justify-center h-full p-3 space-y-2">
                        <div className="flex h-8 w-8 items-center justify-center group-hover:scale-110 transition-transform duration-200">
                          {app.isLucide ? (
                            <app.icon className="h-8 w-8 text-gray-700 group-hover:text-orange-600 transition-colors duration-200" />
                          ) : (
                            <div
                              className="h-8 w-8 group-hover:scale-110 transition-transform duration-200"
                              dangerouslySetInnerHTML={{ __html: app.logo }}
                            />
                          )}
                        </div>
                        <span className="text-muted-foreground group-hover:text-gray-800 text-center text-xs font-medium transition-colors duration-200">
                          {app.name}
                        </span>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      
      {/* Start demo section */}
      {/* Benefits Section */}
      <section 
        id="demo" 
        className="w-full py-20 md:py-28 bg-gradient-to-b from-orange-50/20 to-white"
        data-section="demo"
      >
        <div className="container mx-auto max-w-6xl px-4 md:px-6">
          {/* Centered heading with entrance animation */}
          <div className={`text-center mb-16 transition-all duration-1000 ${isVisible.demo ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <h2 className="mb-6 text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
              Collaborate on your Computer
            </h2>
            <p className="text-muted-foreground text-lg leading-relaxed md:text-xl text-center max-w-2xl mx-auto">
              Foxychat simplifies your daily computer interactions with AI.
            </p>
          </div>

          {/* Workflow comparison with slide-in animation */}
          <div className={`flex justify-center mb-16 transition-all duration-1000 delay-200 ${isVisible.demo ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8'}`}>
            <div className="bg-white/80 backdrop-blur-sm space-y-6 rounded-xl p-8 md:p-10 max-w-2xl w-full border border-gray-200/50 shadow-lg hover:shadow-xl transition-shadow duration-300">
              <div className="space-y-3">
                <div className="text-muted-foreground text-sm font-medium">Instead of:</div>
                <div className="font-mono text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-100 transform hover:scale-105 transition-transform duration-200">
                  1. Open browser → 2. Copy → 3. Change tab → 4. Paste → 5. Ask
                </div>
              </div>
              <div className="space-y-3">
                <div className="text-muted-foreground text-sm font-medium">Now Simply Do:</div>
                <div className="font-mono text-sm text-green-600 bg-green-50 p-3 rounded-lg border border-green-100 transform hover:scale-105 transition-transform duration-200">
                  "1. Shortcut → 2. Ask"
                </div>
              </div>
            </div>
          </div>

          {/* Demo Video Section with zoom-in animation */}
          <div className={`text-center transition-all duration-1000 delay-400 ${isVisible.demo ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
            <div className="mx-auto max-w-2xl">
              <div className="relative overflow-hidden rounded-xl bg-white shadow-xl border border-gray-200 hover:shadow-2xl transition-shadow duration-300">
                <div className="aspect-video w-full">
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-orange-100 to-orange-200 hover:from-orange-150 hover:to-orange-250 transition-all duration-300">
                    <div className="text-center space-y-4">
                      <div className="mx-auto h-12 w-12 rounded-full bg-orange-500 flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-110 transition-all duration-300">
                        <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                      </div>
                      <p className="text-gray-700 font-medium">Demo Video Coming Soon</p>
                      <p className="text-gray-600 text-sm">Watch how Foxychat transforms your workflow</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Does a Lot More Than chat Section */}
      <section 
        className="w-full py-16 md:py-24 bg-gradient-to-br from-gray-50/50 via-blue-50/30 to-indigo-50/40"
        data-section="features"
      >
        <div className="container mx-auto max-w-6xl px-4 md:px-6">
          <div className={`text-center mb-16 transition-all duration-1000 ${isVisible.features ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <h2 className="mb-6 text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
              Does a Lot More Than Chat
            </h2>
            <p className="text-muted-foreground mx-auto max-w-2xl text-lg md:text-xl">
              Foxychat goes beyond simple conversations to become your intelligent desktop companion
            </p>
          </div>

          {/* Small Demo Video with entrance animation */}
          <div className={`mb-16 flex justify-center transition-all duration-1000 delay-200 ${isVisible.features ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
            <div className="max-w-2xl w-full">
              <div className="relative overflow-hidden rounded-xl bg-white shadow-xl border border-blue-200 hover:shadow-2xl hover:border-blue-300 transition-all duration-300">
                <div className="aspect-video w-full">
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100 hover:from-blue-100 hover:to-blue-150 transition-all duration-300">
                    <div className="text-center space-y-3">
                      <div className="mx-auto h-10 w-10 rounded-full bg-blue-500 flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-110 transition-all duration-300">
                        <svg className="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                      </div>
                      <p className="text-blue-700 font-medium text-sm">Feature Demo Video</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Feature grid with stagger animation */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                emoji: "🔧",
                title: "Integrate with your favorite app",
                description: "Integrate with your favorite app and use it with Foxychat through MCP Server",
                delay: 0
              },
              {
                emoji: "🧠", 
                title: "Context Awareness",
                description: "Understands what you're working on and provides relevant assistance",
                delay: 200
              },
              {
                emoji: "⚡",
                title: "Instant Actions", 
                description: "Execute complex operations with simple text commands",
                delay: 400
              }
            ].map((feature, index) => (
              <div 
                key={index}
                className={`text-center space-y-4 p-6 rounded-lg bg-white/60 backdrop-blur-sm hover:bg-white/80 transition-all duration-500 border border-blue-100/50 shadow-sm hover:shadow-md hover:scale-105 transform ${isVisible.features ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
                style={{ transitionDelay: `${400 + feature.delay}ms` }}
              >
                <div className="bg-orange-100 rounded-full w-12 h-12 flex items-center justify-center mx-auto shadow-sm hover:shadow-md hover:scale-110 transition-all duration-300">
                  <span className="text-orange-600 text-lg">{feature.emoji}</span>
                </div>
                <h4 className="text-xl font-semibold">{feature.title}</h4>
                <p className="text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Build Your Own Agent Section */}
      <section 
        className="w-full py-16 md:py-24 bg-gradient-to-br from-indigo-50/40 via-purple-50/30 to-pink-50/40"
        data-section="agent"
      >
        <div className="container mx-auto max-w-6xl px-4 md:px-6">
          <div className={`text-center mb-16 transition-all duration-1000 ${isVisible.agent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <h2 className="mb-6 text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
              Build Your Own Agent
            </h2>
            <p className="text-muted-foreground mx-auto max-w-2xl text-lg md:text-xl">
              Create custom AI agents tailored to your specific workflows and integrate them seamlessly with Foxychat
            </p>
          </div>

          {/* Agent Builder Demo Video with entrance animation */}
          <div className={`mb-16 flex justify-center transition-all duration-1000 delay-200 ${isVisible.agent ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
            <div className="max-w-2xl w-full">
              <div className="relative overflow-hidden rounded-xl bg-white shadow-xl border border-purple-200 hover:shadow-2xl hover:border-purple-300 transition-all duration-300">
                <div className="aspect-video w-full">
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-purple-50 to-purple-100 hover:from-purple-100 hover:to-purple-150 transition-all duration-300">
                    <div className="text-center space-y-4">
                      <div className="mx-auto h-12 w-12 rounded-full bg-purple-500 flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-110 transition-all duration-300">
                        <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                      </div>
                      <p className="text-purple-700 font-medium">Agent Builder Demo</p>
                      <p className="text-purple-600 text-sm">See how to create your custom AI agent</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Agent Building Features with slide-in animations */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            {[
              {
                emoji: "🛠️",
                title: "No-Code Builder",
                description: "Create powerful agents without writing a single line of code using our intuitive visual builder",
                direction: "left"
              },
              {
                emoji: "🔗",
                title: "MCP Integration", 
                description: "Leverage Model Context Protocol to connect your agents with any application or service",
                direction: "right"
              }
            ].map((feature, index) => (
              <div 
                key={index}
                className={`text-center space-y-4 p-8 rounded-lg bg-white/60 backdrop-blur-sm hover:bg-white/80 transition-all duration-500 border border-purple-100/50 shadow-sm hover:shadow-md hover:scale-105 transform ${isVisible.agent ? 'opacity-100 translate-x-0' : `opacity-0 ${feature.direction === 'left' ? '-translate-x-8' : 'translate-x-8'}`}`}
                style={{ transitionDelay: `${400 + index * 200}ms` }}
              >
                <div className="bg-blue-100 rounded-full w-12 h-12 flex items-center justify-center mx-auto shadow-sm hover:shadow-md hover:scale-110 transition-all duration-300">
                  <span className="text-blue-600 text-lg">{feature.emoji}</span>
                </div>
                <h4 className="text-xl font-semibold">{feature.title}</h4>
                <p className="text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  );
};

export default Index;
