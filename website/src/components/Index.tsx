import DemoVideoSection from "@/components/DemoVideoSection";
import Footer from "@/components/Footer";
import HeroImage from "@/components/HeroImage";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Code, Download, FileText, Palette, Table } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  siDiscord,
  siFigma,
  siGithub,
  siGnubash,
  siGooglechrome,
  siJira,
  siNotion,
  siObsidian,
  siSlack,
} from "simple-icons";

const Index = () => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isVisible, setIsVisible] = useState({
    hero: false,
    apps: false,
    demo: false,
    features: false,
    coreFeatures: false,
    agent: false,
  });

  // Intersection Observer for scroll animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const target = entry.target.getAttribute("data-section");
            if (target) {
              setIsVisible((prev) => ({ ...prev, [target]: true }));
            }
          }
        });
      },
      { threshold: 0.1 },
    );

    const sections = document.querySelectorAll("[data-section]");
    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, []);

  // Add custom CSS animations
  useEffect(() => {
    const style = document.createElement("style");
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
        className="from-primary/5 to-accent/5 relative w-full overflow-hidden bg-linear-to-br py-20 pt-28 md:py-28 md:pt-36"
        data-section="hero"
      >
        {/* Animated background elements */}
        <div className="via-primary/10 absolute inset-0 animate-pulse bg-linear-to-r from-transparent to-transparent"></div>
        <div className="from-primary/20 absolute top-0 right-0 h-full w-1/3 bg-linear-to-l to-transparent"></div>
        <div
          className="bg-primary/8 absolute top-1/4 left-1/4 h-32 w-32 animate-bounce rounded-full blur-xl"
          style={{ animationDuration: "3s" }}
        ></div>
        <div
          className="bg-primary/12 absolute right-1/4 bottom-1/3 h-48 w-48 animate-pulse rounded-full blur-2xl"
          style={{ animationDuration: "4s" }}
        ></div>

        <div className="relative z-10 container mx-auto px-4 md:px-6 lg:px-8">
          <div className="mb-20 flex items-center justify-center">
            {/* Centered Content with stagger animation */}
            <div
              className={`max-w-7xl space-y-8 text-center transition-all duration-1000 lg:space-y-10 ${isVisible.hero ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}
            >
              <h1
                className={`bg-clip-text text-4xl leading-tight font-bold tracking-tight whitespace-nowrap text-transparent transition-all delay-200 duration-1200 sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl ${isVisible.hero ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"}`}
                style={{
                  backgroundImage:
                    "linear-gradient(to right, rgb(30 41 59) 0%, rgb(30 41 59) 30%, rgb(251 146 60) 50%, rgb(251 146 60) 100%)",
                }}
              >
                Your AI Desktop Companion
              </h1>
              <p
                className={`text-muted-foreground mx-auto text-lg leading-relaxed font-medium whitespace-nowrap transition-all delay-400 duration-1000 md:text-xl ${isVisible.hero ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}
              >
                Desktop AI assistant that you can call anywhere you want and understands your
                workflows
              </p>
              <div
                className={`flex flex-col gap-4 pt-4 transition-all delay-600 duration-1000 sm:flex-row sm:justify-center sm:gap-6 ${isVisible.hero ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}
              >
                <Button
                  size="lg"
                  className="from-primary to-accent hover:from-primary/90 hover:to-accent/90 hover:shadow-primary/40 transform animate-pulse bg-linear-to-r px-10 py-4 text-lg font-semibold shadow-xl transition-all duration-300 hover:scale-105 hover:animate-none"
                  style={{ animationDuration: "2s" }}
                  asChild
                >
                  <Link to="/download">
                    Download Latest Version
                    <Download className="ml-3 h-5 w-5" />
                  </Link>
                </Button>
              </div>

              <div className="min-h-128 w-full transform transition-transform duration-500 hover:scale-105 lg:min-h-144 xl:min-h-160">
                <HeroImage />
              </div>
            </div>
          </div>

          {/* Integrated Apps Support Section with stagger animation */}
          <div
            className={`space-y-8 transition-all delay-800 duration-1000 md:space-y-12 ${isVisible.hero ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"}`}
            data-section="apps"
          >
            <div className="text-center">
              <p className="text-muted-foreground mx-auto max-w-[600px] text-lg font-medium md:text-xl">
                Foxychat's MCP integrates seamlessly with your favorite productivity tools
              </p>
            </div>

            <div className="relative">
              {/* Enhanced arrow buttons */}
              <Button
                variant="outline"
                size="icon"
                className="border-primary/20 hover:border-primary/30 hover:bg-primary/5 absolute top-1/2 left-0 z-10 -translate-y-1/2 bg-white/90 shadow-lg backdrop-blur-sm transition-all duration-200 hover:scale-110"
                onClick={scrollLeft}
              >
                <ChevronLeft className="text-primary h-4 w-4" />
              </Button>

              <Button
                variant="outline"
                size="icon"
                className="border-primary/20 hover:border-primary/30 hover:bg-primary/5 absolute top-1/2 right-0 z-10 -translate-y-1/2 bg-white/90 shadow-lg backdrop-blur-sm transition-all duration-200 hover:scale-110"
                onClick={scrollRight}
              >
                <ChevronRight className="text-primary h-4 w-4" />
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
                      className={`group border-border hover:border-primary/20 h-24 w-24 shrink-0 border bg-white/90 shadow-md backdrop-blur-sm transition-all duration-300 hover:scale-110 hover:bg-white hover:shadow-lg ${isVisible.apps ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}
                      style={{
                        transitionDelay: `${(index % 13) * 100}ms`,
                        animation: isVisible.apps
                          ? `fadeInUp 0.6s ease-out ${(index % 13) * 100}ms both`
                          : "none",
                      }}
                    >
                      <CardContent className="flex h-full flex-col items-center justify-center space-y-2 p-3">
                        <div className="flex h-8 w-8 items-center justify-center transition-transform duration-200 group-hover:scale-110">
                          {app.isLucide ? (
                            <app.icon className="text-foreground/70 group-hover:text-primary h-8 w-8 transition-colors duration-200" />
                          ) : (
                            <div
                              className="h-8 w-8 transition-transform duration-200 group-hover:scale-110"
                              dangerouslySetInnerHTML={{ __html: app.logo || "" }}
                            />
                          )}
                        </div>
                        <span className="text-muted-foreground group-hover:text-foreground text-center text-xs font-medium transition-colors duration-200">
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
        className="from-primary/5 to-background w-full bg-linear-to-b py-20 md:py-28"
        data-section="demo"
      >
        <div className="container mx-auto max-w-6xl px-4 md:px-6">
          {/* Centered heading with entrance animation */}
          <div
            className={`mb-16 text-center transition-all duration-1000 ${isVisible.demo ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}
          >
            <h2 className="mb-6 text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
              Collaborate on your Computer
            </h2>
            <p className="text-muted-foreground mx-auto max-w-2xl text-center text-lg leading-relaxed md:text-xl">
              Foxychat simplifies your daily computer interactions with AI.
            </p>
          </div>

          {/* Workflow comparison with slide-in animation */}
          <div
            className={`mb-16 flex justify-center transition-all delay-200 duration-1000 ${isVisible.demo ? "translate-x-0 opacity-100" : "-translate-x-8 opacity-0"}`}
          >
            <div className="w-full max-w-2xl space-y-6 rounded-xl border border-gray-200/50 bg-white/80 p-8 shadow-lg backdrop-blur-xs transition-shadow duration-300 hover:shadow-xl md:p-10">
              <div className="space-y-3">
                <div className="text-muted-foreground text-sm font-medium">Instead of:</div>
                <div className="border-destructive/20 bg-destructive/5 text-destructive transform rounded-lg border p-3 font-mono text-sm transition-transform duration-200 hover:scale-105">
                  1. Open browser → 2. Copy → 3. Change tab → 4. Paste → 5. Ask
                </div>
              </div>
              <div className="space-y-3">
                <div className="text-muted-foreground text-sm font-medium">Now Simply Do:</div>
                <div className="border-primary/20 bg-primary/5 text-primary transform rounded-lg border p-3 font-mono text-sm transition-transform duration-200 hover:scale-105">
                  "1. Shortcut → 2. Ask"
                </div>
              </div>
            </div>
          </div>

          {/* Demo Videos Section with zoom-in animation */}
          <DemoVideoSection isVisible={isVisible.demo} />
        </div>
      </section>

      {/* Does a Lot More Than chat Section */}
      <section
        className="from-muted/20 via-secondary/30 to-accent/10 w-full bg-linear-to-br py-16 md:py-24"
        data-section="features"
      >
        <div className="container mx-auto max-w-6xl px-4 md:px-6">
          <div
            className={`mb-16 text-center transition-all duration-1000 ${isVisible.features ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}
          >
            <h2 className="mb-6 text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
              Does a Lot More Than Chat
            </h2>
            <p className="text-muted-foreground mx-auto max-w-2xl text-lg md:text-xl">
              Foxychat goes beyond simple conversations to become your intelligent desktop companion
            </p>
          </div>

          {/* Small Demo Video with entrance animation */}
          <div
            className={`mb-16 flex justify-center transition-all delay-200 duration-1000 ${isVisible.features ? "scale-100 opacity-100" : "scale-95 opacity-0"}`}
          >
            <div className="w-full max-w-2xl">
              <div className="border-primary/20 bg-card hover:border-primary/30 relative overflow-hidden rounded-xl border shadow-xl transition-all duration-300 hover:shadow-2xl">
                <div className="aspect-video w-full">
                  <div className="from-primary/5 to-primary/10 hover:from-primary/10 flex h-full w-full items-center justify-center bg-linear-to-br transition-all duration-300">
                    <div className="space-y-3 text-center">
                      <div className="bg-primary mx-auto flex h-10 w-10 items-center justify-center rounded-full shadow-lg transition-all duration-300 hover:scale-110 hover:shadow-xl">
                        <svg
                          className="text-primary-foreground h-4 w-4"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                      <p className="text-primary text-sm font-medium">Feature Demo Video</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Feature grid with stagger animation */}
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {[
              {
                emoji: "🔧",
                title: "Integrate with your favorite app",
                description:
                  "Integrate with your favorite app and use it with Foxychat through MCP Server",
                delay: 0,
              },
              {
                emoji: "🧠",
                title: "Context Awareness",
                description: "Understands what you're working on and provides relevant assistance",
                delay: 200,
              },
              {
                emoji: "⚡",
                title: "Instant Actions",
                description: "Execute complex operations with simple text commands",
                delay: 400,
              },
            ].map((feature, index) => (
              <div
                key={index}
                className={`border-border bg-card/60 hover:bg-card/80 transform space-y-4 rounded-lg border p-6 text-center shadow-sm backdrop-blur-sm transition-all duration-500 hover:scale-105 hover:shadow-md ${isVisible.features ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}
                style={{ transitionDelay: `${400 + feature.delay}ms` }}
              >
                <div className="bg-primary/10 mx-auto flex h-12 w-12 items-center justify-center rounded-full shadow-sm transition-all duration-300 hover:scale-110 hover:shadow-md">
                  <span className="text-primary text-lg">{feature.emoji}</span>
                </div>
                <h4 className="text-xl font-semibold">{feature.title}</h4>
                <p className="text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Core Features Section */}
      <section
        className="from-background via-muted/30 to-secondary/20 w-full bg-linear-to-br py-16 md:py-24"
        data-section="coreFeatures"
      >
        <div className="container mx-auto max-w-6xl px-4 md:px-6">
          <div
            className={`mb-16 text-center transition-all duration-1000 ${isVisible.coreFeatures ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}
          >
            <h2 className="mb-6 text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
              Powerful Core Features
            </h2>
            <p className="text-muted-foreground mx-auto max-w-2xl text-lg md:text-xl">
              Discover the advanced capabilities that make Foxychat your ultimate AI desktop
              companion
            </p>
          </div>

          {/* Core Features Grid */}
          <div className="mx-auto grid max-w-4xl grid-cols-1 gap-8 md:grid-cols-2">
            {/* Current App Detection */}
            <div
              className={`group border-border bg-card overflow-hidden rounded-xl border shadow-xl transition-all duration-500 hover:scale-105 hover:shadow-2xl ${isVisible.coreFeatures ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}
              style={{ transitionDelay: "0ms" }}
            >
              <div
                className="aspect-video w-full bg-cover bg-center bg-no-repeat transition-transform duration-500 group-hover:scale-110"
                style={{ backgroundImage: "url(/images/current-app-detected.jpg)" }}
              />
              <div className="from-primary/5 to-accent/5 bg-linear-to-r p-6">
                <h3 className="text-foreground mb-3 text-xl font-semibold">Smart App Detection</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Automatically detects your current application and provides contextual assistance.
                  Foxychat understands what you're working on and adapts its responses accordingly.
                </p>
              </div>
            </div>

            {/* MCP Market */}
            <div
              className={`group border-border bg-card overflow-hidden rounded-xl border shadow-xl transition-all duration-500 hover:scale-105 hover:shadow-2xl ${isVisible.coreFeatures ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}
              style={{ transitionDelay: "200ms" }}
            >
              <div
                className="aspect-video w-full bg-cover bg-center bg-no-repeat transition-transform duration-500 group-hover:scale-110"
                style={{ backgroundImage: "url(/images/mcp-market.jpg)" }}
              />
              <div className="from-secondary/10 to-accent/10 h-full bg-linear-to-r p-6">
                <h3 className="text-foreground mb-3 text-xl font-semibold">MCP Marketplace</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Explore a rich ecosystem of Model Context Protocol integrations. Discover and
                  install plugins that extend Foxychat's capabilities instantly.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Build Your Own Agent Section */}
      <section
        className="from-accent/10 via-secondary/30 to-primary/10 w-full bg-linear-to-br py-16 md:py-24"
        data-section="agent"
      >
        <div className="container mx-auto max-w-6xl px-4 md:px-6">
          <div
            className={`mb-16 text-center transition-all duration-1000 ${isVisible.agent ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}
          >
            <h2 className="mb-6 text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
              Build Your Own Agent
            </h2>
            <p className="text-muted-foreground mx-auto max-w-2xl text-lg md:text-xl">
              Create custom AI agents tailored to your specific workflows and integrate them
              seamlessly with Foxychat
            </p>
          </div>

          {/* Agent Builder Demo Video with entrance animation */}
          <div
            className={`mb-16 flex justify-center transition-all delay-200 duration-1000 ${isVisible.agent ? "scale-100 opacity-100" : "scale-95 opacity-0"}`}
          >
            <div className="w-full max-w-2xl">
              <div className="border-accent/20 bg-card hover:border-accent/30 relative overflow-hidden rounded-xl border shadow-xl transition-all duration-300 hover:shadow-2xl">
                <div
                  className="aspect-video w-full bg-cover bg-center bg-no-repeat transition-transform duration-500 hover:scale-105"
                  style={{ backgroundImage: "url(/images/custom-agent.jpg)" }}
                />
              </div>
            </div>
          </div>

          {/* Agent Building Features with slide-in animations */}
          <div className="grid grid-cols-1 gap-12 md:grid-cols-2">
            {[
              {
                emoji: "🛠️",
                title: "No-Code Builder",
                description:
                  "Create powerful agents without writing a single line of code using our intuitive visual builder",
                direction: "left",
              },
              {
                emoji: "🔗",
                title: "MCP Integration",
                description:
                  "Leverage Model Context Protocol to connect your agents with any application or service",
                direction: "right",
              },
            ].map((feature, index) => (
              <div
                key={index}
                className={`border-border bg-card/60 hover:bg-card/80 transform space-y-4 rounded-lg border p-8 text-center shadow-sm backdrop-blur-sm transition-all duration-500 hover:scale-105 hover:shadow-md ${isVisible.agent ? "translate-x-0 opacity-100" : `opacity-0 ${feature.direction === "left" ? "-translate-x-8" : "translate-x-8"}`}`}
                style={{ transitionDelay: `${400 + index * 200}ms` }}
              >
                <div className="bg-accent/10 mx-auto flex h-12 w-12 items-center justify-center rounded-full shadow-sm transition-all duration-300 hover:scale-110 hover:shadow-md">
                  <span className="text-accent text-lg">{feature.emoji}</span>
                </div>
                <h4 className="text-xl font-semibold">{feature.title}</h4>
                <p className="text-muted-foreground">{feature.description}</p>
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
