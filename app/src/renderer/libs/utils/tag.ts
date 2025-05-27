// Clean up chat title to handle copied content and other formatting
export const cleanTitle = (title: string) => {
  if (!title) return "Untitled Conversation";

  // A single regex to handle both <copied>...</copied> and standalone <copied>
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
      // matches the standalone <copied> tag
      return "📋 ";
    },
  );

  // Remove other common XML-like tags that might appear
  // cleanedTitle = cleanedTitle.replace(/<[^>]*>/g, '');

  // If title is empty after cleaning, provide a fallback
  if (!cleanedTitle) {
    return "Untitled Conversation";
  }

  // Truncate very long titles
  if (cleanedTitle.length > 100) {
    cleanedTitle = cleanedTitle.substring(0, 100) + "...";
  }

  return cleanedTitle;
};
