import { Code, FileText, Palette, Table } from "lucide-react";
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
                className={`group h-32 w-32 shrink-0 border border-gray-200 bg-white/90 shadow-md backdrop-blur-sm transition-all duration-300 hover:scale-110 hover:bg-white hover:shadow-lg ${isVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}
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
