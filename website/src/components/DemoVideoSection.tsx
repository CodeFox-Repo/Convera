import { useState } from "react";
import { Button } from "./ui/button";
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
            "Watch how Foxychat transforms your vision into a fully functional website with just a conversation",
          gradientColors: "bg-linear-to-r from-orange-50 to-orange-100",
        },
        {
          url: "/demos/create-website-demo.mp4", // You can replace with actual coding demo
          title: "Code Review & Refactoring",
          description:
            "Get instant code reviews and refactoring suggestions through natural conversation",
          gradientColors: "bg-linear-to-r from-purple-50 to-purple-100",
        },
      ],
    },
    finance: {
      label: "Finance",
      videos: [
        {
          url: "/demos/excel-demo.mp4",
          title: "Excel Wizardry Made Simple",
          description:
            "Transform complex spreadsheet tasks into effortless conversations with your AI assistant",
          gradientColors: "bg-linear-to-r from-blue-50 to-blue-100",
        },
        {
          url: "/demos/excel-demo.mp4", // You can replace with actual finance demo
          title: "Financial Analysis & Reporting",
          description:
            "Generate comprehensive financial reports and analysis with simple voice commands",
          gradientColors: "bg-linear-to-r from-green-50 to-green-100",
        },
      ],
    },
    marketing: {
      label: "Marketing",
      videos: [
        {
          url: "/demos/create-website-demo.mp4", // You can replace with actual marketing demo
          title: "Content Creation & Automation",
          description:
            "Create compelling marketing content and automate your campaigns effortlessly",
          gradientColors: "bg-linear-to-r from-pink-50 to-pink-100",
        },
        {
          url: "/demos/excel-demo.mp4", // You can replace with actual analytics demo
          title: "Marketing Analytics Dashboard",
          description: "Build powerful analytics dashboards to track your marketing performance",
          gradientColors: "bg-linear-to-r from-cyan-50 to-cyan-100",
        },
      ],
    },
    general: {
      label: "General",
      videos: [
        {
          url: "/demos/create-website-demo.mp4",
          title: "Productivity Workflow Automation",
          description: "Streamline your daily tasks and workflows with intelligent automation",
          gradientColors: "bg-linear-to-r from-orange-50 to-orange-100",
        },
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
        <h3 className="mb-4 text-2xl font-semibold">See Foxychat in Action</h3>
        <p className="text-muted-foreground text-lg">
          Discover how Foxychat transforms workflows across different industries
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
              className="text-sm"
            >
              {category.label}
            </Button>
          ))}
        </div>

        {/* Demo Videos Grid */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
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
