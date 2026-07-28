import { useState } from "react";
import ReactPlayer from "react-player";

interface VideoProps {
  url: string;
  title: string;
  description: string;
}

const Video = ({ url, title, description }: VideoProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  return (
    <figure>
      <div className="border-rule bg-well relative aspect-video w-full overflow-hidden rounded-[13px] border">
        <ReactPlayer
          url={url}
          width="100%"
          height="100%"
          playing={true}
          muted={true}
          loop={true}
          controls={true}
          playsinline={true}
          config={{ file: { attributes: { preload: "metadata" } } }}
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
          className="absolute inset-0 h-full w-full object-cover"
          onReady={() => setIsLoading(false)}
          onStart={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
        />

        {isLoading && !hasError && (
          <div className="bg-well text-ink-faint absolute inset-0 z-10 flex items-center justify-center font-mono text-[13px]">
            loading recording…
          </div>
        )}

        {hasError && (
          <div className="bg-well text-ink-faint absolute inset-0 z-10 flex items-center justify-center font-mono text-[13px]">
            ✗ recording unavailable
          </div>
        )}
      </div>
      <figcaption className="mt-3 font-mono text-xs leading-relaxed">
        <span className="text-ink-2">{title}</span>
        <span className="text-ink-faint"> · {description}</span>
      </figcaption>
    </figure>
  );
};

export default Video;
