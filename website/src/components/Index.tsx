import Footer from "@/components/Footer";
import HeroImage from "@/components/HeroImage";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { DollarSign, Download, MessageCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import AppsSupportSection from "./apps_support_section";
import CommunityCard from "./community_card";
import DemoVideoSection from "./DemoVideoSection";
import FeaturesShowcaseCard from "./FeaturesShowcaseCard";

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
        className="relative w-full overflow-hidden py-20 pt-28 md:py-28 md:pt-36"
        data-section="hero"
      >
        {/* Animated background elements */}
        <div className="bg-opacity-50 absolute inset-0 bg-white"></div>
        <div className="absolute top-0 right-0 h-full w-1/3"></div>
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
                className={`text-4xl leading-tight font-bold tracking-tight text-gray-800 sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl ${isVisible.hero ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"}`}
              >
                Your AI Desktop
                <br />
                Companion
              </h1>
              <p
                className={`text-muted-foreground mx-auto text-lg leading-relaxed font-medium md:text-xl ${isVisible.hero ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}
              >
                AI assistant you can access anywhere, designed to integrate with your workflows.
              </p>
              <div
                className={`flex flex-col gap-4 pt-4 transition-all delay-600 duration-1000 sm:flex-row sm:justify-center sm:gap-6 ${isVisible.hero ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}
              >
                <Button
                  size="lg"
                  className="transform bg-black px-10 py-4 text-lg font-semibold text-white shadow-xl transition-all duration-300 hover:scale-105 hover:bg-gray-800"
                  asChild
                >
                  <Link to="/download">
                    Download Latest Version
                    <Download className="ml-3 h-5 w-5" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>

          <div className="min-h-128 w-full transform transition-transform duration-500 hover:scale-105 lg:min-h-144 xl:min-h-160">
            <HeroImage />
          </div>

          <AppsSupportSection isVisible={isVisible.hero} />
        </div>
      </section>

      {/* Start demo section */}
      {/* Benefits Section */}
      <section id="demo" data-section="demo" className="w-full bg-white py-20 md:py-28">
        <div className="container mx-auto max-w-6xl px-4 md:px-6">
          <div className="mb-16 text-center">
            <h2 className="mb-6 text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
              Collaborate on your Computer
            </h2>
            <p className="text-muted-foreground mx-auto max-w-2xl text-center text-lg leading-relaxed md:text-xl">
              Foxychat simplifies your daily computer interactions with AI.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-12 md:grid-cols-2">
            <FeaturesShowcaseCard
              title="Smart App Detection"
              description="Automatically detects your current application and provides contextual assistance. Foxychat understands what you're working on and adapts its responses accordingly."
              imageUrl="/images/current-app-detected.jpg"
            />
            <FeaturesShowcaseCard
              title="MCP Marketplace"
              description="Explore a rich ecosystem of Model Context Protocol integrations. Discover and install plugins that extend Foxychat's capabilities instantly."
              imageUrl="/images/mcp-market.jpg"
            />
          </div>
        </div>
      </section>

      {/* Does a Lot More Than chat Section */}
      <section className="w-full py-16 md:py-24" data-section="features">
        <div className="container mx-auto max-w-6xl px-4 md:px-6">
          <div
            className={`mb-16 text-center transition-all duration-1000 ${isVisible.features ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}
          >
            <h2 className="mb-6 text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
              Does a Lot More Than Chat
            </h2>

            {/* Demo Videos Section with zoom-in animation */}
            <DemoVideoSection isVisible={isVisible.demo} />
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
                className={`transform space-y-4 rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm transition-all duration-500 hover:scale-105 hover:shadow-md ${isVisible.features ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}
                style={{ transitionDelay: `${400 + feature.delay}ms` }}
              >
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 shadow-sm transition-all duration-300 hover:scale-110 hover:shadow-md">
                  <span className="text-lg text-gray-800">{feature.emoji}</span>
                </div>
                <h4 className="text-xl font-semibold">{feature.title}</h4>
                <p className="text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Join Foxychat Community Section */}
      <section className="w-full bg-gray-50 py-20 md:py-28">
        <div className="container mx-auto max-w-6xl px-4 md:px-6">
          <div className="mb-16 text-center">
            <h2 className="mb-6 text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
              Join Foxychat Community
            </h2>
            <p className="text-muted-foreground mx-auto max-w-2xl text-center text-lg leading-relaxed md:text-xl">
              Get started with Foxychat today and become part of our growing community
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            <CommunityCard
              icon={Download}
              title="Download Now"
              description="Get the latest version of Foxychat and start enhancing your productivity today."
              buttonText="Download Free"
              href="/download"
            />
            <CommunityCard
              icon={MessageCircle}
              title="Join Our Discord"
              description="Connect with other users, get support, and share your experiences with the community."
              buttonText="Join Discord"
              href="https://discord.gg/foxychat"
              isExternal={true}
            />
            <CommunityCard
              icon={DollarSign}
              title="View Pricing"
              description="Explore our pricing plans and find the perfect option for your needs."
              buttonText="See Pricing"
              href="/pricing"
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  );
};

export default Index;
