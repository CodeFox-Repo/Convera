import React from "react";

interface RateLimitErrorProps {
  blockedUntil?: string;
}

const RateLimitError: React.FC<RateLimitErrorProps> = ({ blockedUntil }) => {
  const getFormattedDateTime = () => {
    if (!blockedUntil) {
      return { main: "Rate limit exceeded." };
    }

    try {
      const date = new Date(blockedUntil);
      const now = new Date();

      const isSameDay =
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate();

      const timeFormat: Intl.DateTimeFormatOptions = {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      };

      const dateFormat: Intl.DateTimeFormatOptions = {
        month: "numeric",
        day: "numeric",
        year: "numeric",
      };

      const timeString = date.toLocaleTimeString([], timeFormat);

      if (isSameDay) {
        return {
          main: `Rate limit exceeded. Continue at ${timeString}.`,
        };
      } else {
        const dateString = date.toLocaleDateString([], dateFormat);
        return {
          main: `Rate limit exceeded. Continue at ${timeString} on ${dateString}.`,
        };
      }
    } catch (e) {
      console.error("Failed to parse date for rate limit error:", e);
      return { main: "Rate limit exceeded." };
    }
  };

  const { main } = getFormattedDateTime();

  return (
    <div className="mx-auto w-[90%] border-orange-500 rounded-md p-4 text-center bg-orange-50 dark:bg-orange-900/20">
      <p className="text-orange-600 dark:text-orange-400 font-medium">{main}</p>
    </div>
  );
};

export default RateLimitError;
