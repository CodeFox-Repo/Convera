import Footer from "@/components/Footer";
import HeroImage from "@/components/HeroImage";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { DollarSign, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { siDiscord } from "simple-icons";
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

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <Navbar />

      {/* Hero Section */}
      <section
        className="relative w-full overflow-hidden py-20 pt-28 md:py-28 md:pt-36"
        data-section="hero"
      >
        {/* Enhanced background with gradient and patterns */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-purple-50"></div>

        {/* Geometric background pattern */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-0 left-0 h-full w-full bg-[radial-gradient(circle_at_25%_25%,rgba(59,130,246,0.1)_0%,transparent_50%),radial-gradient(circle_at_75%_75%,rgba(147,51,234,0.1)_0%,transparent_50%)]"></div>
        </div>

        {/* Floating geometric shapes */}
        <div
          className="animate-float absolute top-10 left-10 h-20 w-20 rounded-lg bg-blue-200/30 blur-sm"
          style={{ animationDelay: "0s" }}
        ></div>
        <div
          className="animate-float absolute top-32 right-20 h-16 w-16 rounded-full bg-purple-200/30 blur-sm"
          style={{ animationDelay: "1s" }}
        ></div>
        <div
          className="animate-float absolute bottom-40 left-20 h-12 w-12 rounded-lg bg-indigo-200/30 blur-sm"
          style={{ animationDelay: "2s" }}
        ></div>
        <div
          className="animate-float absolute right-32 bottom-20 h-24 w-24 rounded-full bg-pink-200/30 blur-sm"
          style={{ animationDelay: "0.5s" }}
        ></div>

        {/* Rotating elements */}
        <div
          className="animate-rotate absolute top-1/4 left-1/4 h-32 w-32 rounded-full border border-blue-200/40"
          style={{ animationDuration: "25s" }}
        ></div>
        <div
          className="animate-rotate absolute right-1/4 bottom-1/3 h-40 w-40 rounded-lg border border-purple-200/40"
          style={{ animationDuration: "30s" }}
        ></div>

        {/* Enhanced animated blobs */}
        <div className="animate-pulse-slow absolute top-1/4 left-1/4 h-32 w-32 rounded-full bg-gradient-to-r from-blue-400/20 to-purple-400/20 blur-xl"></div>
        <div
          className="animate-pulse-slow absolute right-1/4 bottom-1/3 h-48 w-48 rounded-full bg-gradient-to-r from-purple-400/20 to-pink-400/20 blur-2xl"
          style={{ animationDelay: "2s" }}
        ></div>
        <div
          className="animate-pulse-slow absolute top-1/2 left-1/6 h-24 w-24 rounded-full bg-gradient-to-r from-indigo-400/15 to-blue-400/15 blur-lg"
          style={{ animationDelay: "1s" }}
        ></div>

        {/* Particle-like dots */}
        <div
          className="animate-float absolute top-20 left-1/3 h-2 w-2 rounded-full bg-blue-400/60"
          style={{ animationDelay: "0.5s" }}
        ></div>
        <div
          className="animate-float absolute top-40 right-1/3 h-1 w-1 rounded-full bg-purple-400/60"
          style={{ animationDelay: "1.5s" }}
        ></div>
        <div
          className="animate-float absolute bottom-32 left-1/2 h-3 w-3 rounded-full bg-indigo-400/60"
          style={{ animationDelay: "2.5s" }}
        ></div>
        <div
          className="animate-float absolute right-1/5 bottom-60 h-2 w-2 rounded-full bg-pink-400/60"
          style={{ animationDelay: "3s" }}
        ></div>
        <div
          className="animate-float absolute top-60 left-1/5 h-1 w-1 rounded-full bg-blue-500/60"
          style={{ animationDelay: "1.2s" }}
        ></div>

        {/* Grid pattern overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>

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
                Assistant
              </h1>
              <p
                className={`text-muted-foreground mx-auto text-lg leading-relaxed font-medium md:text-xl ${isVisible.hero ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}
              >
                AI assistant you can access anywhere, integrate with your workflows.
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
      <section
        id="demo"
        data-section="demo"
        className="relative w-full overflow-hidden bg-gradient-to-b from-gray-50 to-white py-20 md:py-28"
      >
        {/* Subtle background elements */}
        <div className="absolute top-0 right-0 h-64 w-64 rounded-full bg-blue-100/20 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 h-48 w-48 rounded-full bg-purple-100/20 blur-2xl"></div>
        <div className="absolute top-1/2 left-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 transform rounded-full bg-gradient-to-r from-blue-50/30 to-purple-50/30 blur-3xl"></div>
        <div className="container mx-auto max-w-7xl px-4 md:px-6">
          <div className="mb-16 text-center">
            <h2 className="mb-6 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
              Foxychat Always Ready
              <br />
              Collaborate On you Computer
            </h2>
            <p className="text-muted-foreground mx-auto max-w-2xl text-center text-lg leading-relaxed md:text-xl">
              Foxychat simplifies your daily computer interactions with AI.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            <div className="md:col-span-2">
              <FeaturesShowcaseCard
                title="Time Saving"
                description="Search for discussions, create folders, add tags, export data, and much more."
                imageUrl="/placeholder.svg"
              />
            </div>
            <FeaturesShowcaseCard
              title="Smart App Detection"
              description="Foxychat knows exactly what you are currently doing when you call it."
              imageUrl="/images/current-app-detected.jpg"
            />
            <FeaturesShowcaseCard
              title="Voice Input"
              description="AI can listen to your words, and listen to your app."
              imageUrl="/placeholder.svg"
            />
            <FeaturesShowcaseCard
              title="Quick Tools Shortcut"
              description="Quickly access apps with shortcuts."
              imageUrl="/placeholder.svg"
            />
            <FeaturesShowcaseCard
              title="App Market"
              description="Use our extension to allow AI access your apps, or do more powerful things."
              imageUrl="/images/mcp-market.jpg"
            />
          </div>
        </div>
      </section>

      {/* Does a Lot More Than chat Section */}
      <section
        className="relative w-full overflow-hidden bg-gradient-to-b from-white to-gray-50 py-16 md:py-24"
        data-section="features"
      >
        {/* Background decorative elements */}
        <div
          className="animate-float absolute top-10 left-10 h-32 w-32 rounded-lg bg-indigo-100/30 blur-sm"
          style={{ animationDelay: "1s" }}
        ></div>
        <div
          className="animate-float absolute right-10 bottom-10 h-40 w-40 rounded-full bg-pink-100/30 blur-sm"
          style={{ animationDelay: "2s" }}
        ></div>
        <div className="animate-pulse-slow absolute top-1/3 right-1/4 h-20 w-20 rounded-full bg-blue-100/40 blur-lg"></div>
        <div className="relative z-10 container mx-auto max-w-6xl px-4 md:px-6">
          <div
            className={`mb-16 text-center transition-all duration-1000 ${isVisible.features ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}
          >
            <h2 className="mb-6 text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
              Does a Lot More Than Chat
            </h2>

            {/* Demo Videos Section with zoom-in animation */}
            <DemoVideoSection isVisible={isVisible.demo} />
          </div>
        </div>
      </section>

      {/* Join Foxychat Community Section */}
      <section className="relative w-full overflow-hidden bg-gradient-to-b from-gray-50 to-white py-20 md:py-28">
        {/* Community section background */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(99,102,241,0.05)_0%,transparent_50%),radial-gradient(circle_at_70%_80%,rgba(168,85,247,0.05)_0%,transparent_50%)]"></div>
        <div
          className="animate-float absolute top-20 left-1/4 h-24 w-24 rounded-lg bg-violet-100/40 blur-sm"
          style={{ animationDelay: "0.5s" }}
        ></div>
        <div
          className="animate-float absolute right-1/4 bottom-20 h-28 w-28 rounded-full bg-blue-100/40 blur-sm"
          style={{ animationDelay: "1.5s" }}
        ></div>
        <div
          className="animate-pulse-slow absolute top-1/2 left-10 h-16 w-16 rounded-full bg-purple-100/30 blur-lg"
          style={{ animationDelay: "2s" }}
        ></div>
        <div className="relative z-10 container mx-auto max-w-6xl px-4 md:px-6">
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
              svgIcon={siDiscord.svg}
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
