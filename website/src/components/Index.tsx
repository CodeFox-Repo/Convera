import Footer from "@/components/Footer";
import HeroImage from "@/components/HeroImage";
import HeroBackground from "@/components/HeroBackground";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { DollarSign, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { siDiscord } from "simple-icons";
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
        <HeroBackground />

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
        </div>
      </section>

      {/* Start demo section */}
      {/* Benefits Section */}
      <section
        id="demo"
        data-section="demo"
        className="relative w-full overflow-hidden py-20 md:py-28"
      >
        <HeroBackground />
        <div className="relative z-10 container mx-auto max-w-7xl px-4 md:px-6">
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

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            <FeaturesShowcaseCard
              title="Time Saving"
              description="Search for discussions, create folders, add tags, export data, and much more."
              imageUrl="/placeholder.svg"
            />
            <div className="grid grid-rows-2 gap-8">
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
            </div>
          </div>
        </div>
      </section>

      {/* Does a Lot More Than chat Section */}
      <section
        className="relative w-full overflow-hidden py-16 md:py-24"
        data-section="features"
      >
        <HeroBackground />

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
      <section className="relative w-full overflow-hidden py-20 md:py-28">
        <HeroBackground />

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
