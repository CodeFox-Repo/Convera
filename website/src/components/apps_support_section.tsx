import { ChevronLeft, ChevronRight, Code, FileText, Palette, Table } from "lucide-react";
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

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface AppsSupportSectionProps {
  isVisible: boolean;
}

const AppsSupportSection = ({ isVisible }: AppsSupportSectionProps) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

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
    <div
      className={`space-y-8 transition-all delay-800 duration-1000 md:space-y-12 ${isVisible ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"}`}
      data-section="apps"
    >
      <div className="text-center">
        <p className="text-muted-foreground mx-auto max-w-[600px] text-lg font-medium md:text-xl">
          Foxychat's App integrates seamlessly with your favorite productivity tools
        </p>
      </div>

      <div className="relative">
        {/* Enhanced arrow buttons */}
        <Button
          variant="outline"
          size="icon"
          className="absolute top-1/2 left-0 z-10 -translate-y-1/2 border-gray-200 bg-white/90 shadow-lg backdrop-blur-sm transition-all duration-200 hover:scale-110 hover:border-gray-300 hover:bg-white/100"
          onClick={scrollLeft}
        >
          <ChevronLeft className="h-4 w-4 text-black" />
        </Button>

        <Button
          variant="outline"
          size="icon"
          className="absolute top-1/2 right-0 z-10 -translate-y-1/2 border-gray-200 bg-white/90 shadow-lg backdrop-blur-sm transition-all duration-200 hover:scale-110 hover:border-gray-300 hover:bg-white/100"
          onClick={scrollRight}
        >
          <ChevronRight className="h-4 w-4 text-black" />
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
                className={`group h-24 w-24 shrink-0 border border-gray-200 bg-white/90 shadow-md backdrop-blur-sm transition-all duration-300 hover:scale-110 hover:bg-white hover:shadow-lg ${isVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}
                style={{
                  transitionDelay: `${(index % 13) * 100}ms`,
                  animation: isVisible
                    ? `fadeInUp 0.6s ease-out ${(index % 13) * 100}ms both`
                    : "none",
                }}
              >
                <CardContent className="flex h-full flex-col items-center justify-center space-y-2 p-3">
                  <div className="flex h-8 w-8 items-center justify-center transition-transform duration-200 group-hover:scale-110">
                    {app.isLucide ? (
                      <app.icon className="h-8 w-8 text-gray-700 transition-colors duration-200 group-hover:text-black" />
                    ) : (
                      <div
                        className="h-8 w-8 transition-transform duration-200 group-hover:scale-110"
                        dangerouslySetInnerHTML={{ __html: app.logo || "" }}
                      />
                    )}
                  </div>
                  <span className="text-muted-foreground text-center text-xs font-medium transition-colors duration-200 group-hover:text-black">
                    {app.name}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AppsSupportSection;
