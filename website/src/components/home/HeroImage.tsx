import React, { useEffect, useRef } from "react";

const HeroImage: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            video.play();
          } else {
            video.pause();
          }
        });
      },
      { threshold: 0.5 }, // Play when 50% of video is visible
    );

    observer.observe(video);

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div className="relative h-[500px] w-full overflow-hidden rounded-lg md:h-[560px] lg:h-[600px] xl:h-[640px]">
      <video
        ref={videoRef}
        src="/demos/notion.mp4"
        muted
        loop
        playsInline
        className="h-full w-full rounded-lg object-contain"
      >
        Your browser does not support the video tag.
      </video>
    </div>
  );
};

export default HeroImage;
