import { useState } from "react";
import { Button } from "@/components/ui/button";
import Video from "./Video";

interface DemoVideoSectionProps {
  isVisible: boolean;
}

const DemoVideoSection = ({ isVisible }: DemoVideoSectionProps) => {
  const [activeCategory, setActiveCategory] = useState("software-engineer");

  const demoVideoCategories = {
    "software-engineer": {
      label: "Software Engineer",
      videos: [
        {
          url: "/demos/create-website-demo.mp4",
          title: "From Idea to Website in Minutes",
          description:
            "Watch how Convera transforms your vision into a fully functional website with just a conversation",
          gradientColors: "bg-linear-to-r from-orange-50 to-orange-100",
        },
      ],
    },
    general: {
      label: "General",
      videos: [
        {
          url: "/demos/excel-demo.mp4",
          title: "Document Processing & Analysis",
          description: "Process and analyze documents, emails, and data with natural language",
          gradientColors: "bg-linear-to-r from-indigo-50 to-indigo-100",
        },
      ],
    },
  };

  return (
    <div
      className={`space-y-12 transition-all delay-400 duration-1000 ${isVisible ? "scale-100 opacity-100" : "scale-95 opacity-0"}`}
    >
      <div className="mb-8 text-center">
        <h3 className="mb-4 text-2xl font-semibold bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">See Convera in Action</h3>
        <p className="text-orange-200/90 text-lg">
          Watch how Convera transforms your daily workflows
        </p>
      </div>

      <div className="mx-auto max-w-6xl">
        {/* Category Buttons */}
        <div className="mb-8 flex flex-wrap justify-center gap-3">
          {Object.entries(demoVideoCategories).map(([key, category]) => (
            <Button
              key={key}
              variant={activeCategory === key ? "secondary" : "outline"}
              onClick={() => setActiveCategory(key)}
              className={`text-sm transition-all duration-200 ${
                activeCategory === key
                  ? "bg-gradient-to-r from-orange-600 to-amber-600 text-white border-orange-500/70 shadow-lg shadow-orange-500/20"
                  : "border-orange-700/40 bg-black/20 text-orange-200 hover:bg-gradient-to-r hover:from-orange-600/20 hover:to-amber-600/20 hover:border-orange-500/60 hover:text-orange-100"
              }`}
            >
              {category.label}
            </Button>
          ))}
        </div>

        {/* Demo Videos Grid */}
        <div
          className={`grid gap-8 ${
            demoVideoCategories[activeCategory as keyof typeof demoVideoCategories].videos
              .length === 1
              ? "mx-auto max-w-2xl grid-cols-1"
              : "grid-cols-1 lg:grid-cols-2"
          }`}
        >
          {demoVideoCategories[activeCategory as keyof typeof demoVideoCategories].videos.map(
            (video, index) => (
              <Video
                key={index}
                url={video.url}
                title={video.title}
                description={video.description}
                gradientColors={video.gradientColors}
              />
            ),
          )}
        </div>
      </div>
    </div>
  );
};

export default DemoVideoSection;
