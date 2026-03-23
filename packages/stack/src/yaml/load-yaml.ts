import { parseDocument } from "yaml";
import { otaviaYamlCustomTags } from "./tags.js";

/**
 * Parse YAML text with Otavia custom tags (`!Env`, `!Secret`, `!Var`, `!Param`)
 * resolved to plain objects (see {@link ./tags.ts}).
 */
export function parseYamlWithOtaviaTags(content: string): unknown {
  const doc = parseDocument(content, { customTags: otaviaYamlCustomTags });
  if (doc.errors.length > 0) {
    throw new Error(doc.errors.map((e) => e.message).join("\n"));
  }
  return doc.toJS();
}
