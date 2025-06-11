import Video from "./Video";

interface DemoVideoSectionProps {
  isVisible: boolean;
}

const DemoVideoSection = ({ isVisible }: DemoVideoSectionProps) => {
  const demoVideos = [
    {
      url: "/demos/create-website-demo.mp4",
      title: "From Idea to Website in Minutes",
      description:
        "Watch how Foxychat transforms your vision into a fully functional website with just a conversation",
      gradientColors: "bg-gradient-to-r from-orange-50 to-orange-100",
    },
    {
      url: "/demos/excel-demo.mp4",
      title: "Excel Wizardry Made Simple",
      description:
        "Transform complex spreadsheet tasks into effortless conversations with your AI assistant",
      gradientColors: "bg-gradient-to-r from-blue-50 to-blue-100",
    },
  ];

  return (
    <div
      className={`space-y-12 transition-all delay-400 duration-1000 ${isVisible ? "scale-100 opacity-100" : "scale-95 opacity-0"}`}
    >
      <div className="mb-8 text-center">
        <h3 className="mb-4 text-2xl font-semibold">See Foxychat in Action</h3>
        <p className="text-muted-foreground text-lg">
          Watch how Foxychat transforms your daily workflows
        </p>
      </div>

      {/* Demo Videos Grid */}
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 lg:grid-cols-2">
        {demoVideos.map((video, index) => (
          <Video
            key={index}
            url={video.url}
            title={video.title}
            description={video.description}
            gradientColors={video.gradientColors}
          />
        ))}
      </div>
    </div>
  );
};

export default DemoVideoSection;
