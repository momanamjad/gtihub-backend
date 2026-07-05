/**
 * Parses GitHub-style search queries into structured key-value filters.
 * Example: "is:pr state:open hello bug" -> { text: "hello bug", is: "pr", state: "open" }
 */
export const parseSearchQuery = (queryStr) => {
  const filters = { text: "" };
  if (!queryStr || typeof queryStr !== 'string') return filters;

  const terms = queryStr.split(/\s+/);
  const textWords = [];

  for (const term of terms) {
    if (term.includes(':')) {
      const parts = term.split(':');
      const key = parts[0].toLowerCase();
      // Combine anything after the first colon in case value has colons
      const value = parts.slice(1).join(':').toLowerCase();
      filters[key] = value;
    } else {
      textWords.push(term);
    }
  }

  filters.text = textWords.join(' ').trim();
  return filters;
};
