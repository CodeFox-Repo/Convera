import { useState } from "react";
import Video from "./Video";

const categories = {
  "software-engineer": {
    label: "software engineer",
    videos: [
      {
        url: "/demos/create-website-demo.mp4",
        title: "idea → running website",
        description: "one conversation, scaffold to deploy",
      },
    ],
  },
  general: {
    label: "general",
    videos: [
      {
        url: "/demos/excel-demo.mp4",
        title: "documents → answers",
        description: "process and analyze files in natural language",
      },
    ],
  },
} as const;

type CategoryKey = keyof typeof categories;

const DemoVideoSection = () => {
  const [active, setActive] = useState<CategoryKey>("software-engineer");

  return (
    <div>
      <div className="mb-8 flex flex-wrap gap-2" role="tablist">
        {(Object.keys(categories) as CategoryKey[]).map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={active === key}
            onClick={() => setActive(key)}
            className={`rounded-[9px] border px-4 py-1.5 font-mono text-[13px] transition-colors ${
              active === key
                ? "border-terracotta-line bg-terracotta-wash text-terracotta-soft"
                : "border-rule text-ink-muted hover:border-rule-2 hover:text-ink-2"
            }`}
          >
            {categories[key].label}
          </button>
        ))}
      </div>

      <div className="mx-auto grid max-w-4xl grid-cols-1 gap-8">
        {categories[active].videos.map((video) => (
          <Video
            key={video.url}
            url={video.url}
            title={video.title}
            description={video.description}
          />
        ))}
      </div>
    </div>
  );
};

export default DemoVideoSection;
