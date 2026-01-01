export const cleanTitle = (title: string) => {
  if (!title) return "Untitled Conversation";

  let cleanedTitle = title.replace(
    /<copied>(.*?)<\/copied>|<copied>/gi,
    (match, content) => {
      if (content) {
        const truncatedContent =
          content.trim().length > 50
            ? content.trim().substring(0, 50) + "..."
            : content.trim();
        return `📋 ${truncatedContent}`;
      }
      return "";
    },
  );

  if (!cleanedTitle) {
    return "";
  }

  if (cleanedTitle.length > 100) {
    cleanedTitle = cleanedTitle.substring(0, 100) + "...";
  }

  return cleanedTitle;
};
