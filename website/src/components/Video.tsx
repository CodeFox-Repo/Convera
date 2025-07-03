import { useState } from "react";
import ReactPlayer from "react-player";

interface VideoProps {
  url: string;
  title: string;
  description: string;
  gradientColors: string;
}

const Video = ({ url, title, description, gradientColors }: VideoProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const handleReady = () => {
    setIsLoading(false);
    console.log(`Video ready: ${title}`);
  };

  const handleStart = () => {
    setIsLoading(false);
    console.log(`Video started: ${title}`);
  };

  const handleError = (error: unknown) => {
    setIsLoading(false);
    setHasError(true);
    console.error(`Video error for ${title}:`, error);
  };

  return (
    <div className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl transition-all duration-300 hover:shadow-2xl">
      <div className="relative aspect-video w-full overflow-hidden bg-black">
        {/* @ts-expect-error ReactPlayer props compatibility */}
        <ReactPlayer
          url={url}
          width="100%"
          height="100%"
          playing={true}
          muted={true}
          loop={true}
          controls={true}
          playsinline={true}
          config={{
            file: {
              attributes: {
                preload: "metadata",
              },
            },
          }}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
          }}
          className="absolute inset-0 h-full w-full object-cover"
          onReady={handleReady}
          onStart={handleStart}
          onError={handleError}
        />

        {/* Hover overlay */}
        <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>

        {/* Loading state */}
        {isLoading && !hasError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-100">
            <div className="text-center">
              <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-b-2 border-orange-500"></div>
              <div className="text-sm text-gray-500">Loading video...</div>
            </div>
          </div>
        )}

        {/* Error state */}
        {hasError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-100">
            <div className="text-center">
              <div className="mb-2 text-lg text-red-500">⚠️</div>
              <div className="text-sm text-gray-500">Video unavailable</div>
            </div>
          </div>
        )}
      </div>
      <div className={`${gradientColors} p-6`}>
        <h4 className="mb-2 text-lg font-semibold text-gray-800">{title}</h4>
        <p className="text-sm text-gray-600">{description}</p>
      </div>
    </div>
  );
};

export default Video;
