/**
 * MEM-139: reads, as it is written, a JSON document { "entries": [ {…}, … ] }
 * and gives each object of the array as soon as it is complete — the
 * entries of a list appear one by one while the model writes them. Objects
 * that don't parse are skipped (the end of the stream says if there were
 * none).
 */
export function arrayObjectReader() {
  let depth = 0;
  let inString = false;
  let escaped = false;
  /** The text of the object being read, from its « { ». */
  let current = '';
  return {
    push(chunk: string): unknown[] {
      const objects: unknown[] = [];
      for (const char of chunk) {
        // Depth 2: inside the array of the root object; an object there is an entry.
        const inEntry = depth >= 3 || (depth === 2 && char === '{');
        if (inEntry) current += char;
        if (inString) {
          if (escaped) escaped = false;
          else if (char === '\\') escaped = true;
          else if (char === '"') inString = false;
          continue;
        }
        if (char === '"') inString = true;
        else if (char === '{' || char === '[') depth++;
        else if (char === '}' || char === ']') {
          depth--;
          if (depth === 2 && char === '}' && current) {
            try {
              objects.push(JSON.parse(current));
            } catch {
              // a broken entry: skipped
            }
            current = '';
          }
        }
      }
      return objects;
    },
  };
}
