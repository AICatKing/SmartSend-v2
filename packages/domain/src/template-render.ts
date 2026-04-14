export type RenderMissingStrategy = "keep" | "empty" | "error";

export type RenderResult = {
  missingVariables: string[];
  rendered: string;
};

export function renderTemplateWithVariables(
  source: string,
  variables: Record<string, string | number | boolean | null>,
  strategy: RenderMissingStrategy,
): RenderResult {
  const missing = new Set<string>();

  const rendered = source.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, rawKey) => {
    const key = String(rawKey).trim();
    const value = variables[key];

    if (value === undefined || value === null) {
      missing.add(key);

      if (strategy === "empty") {
        return "";
      }

      if (strategy === "error") {
        return "";
      }

      return `{{${key}}}`;
    }

    return String(value);
  });

  return {
    rendered,
    missingVariables: Array.from(missing),
  };
}
