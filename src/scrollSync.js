// Build a mapping from JSON tree paths to the source line where each value starts.
// This works with minified JSON, custom indentation, nested arrays, and escaped strings.
export function buildJsonPathLineMap(source) {
  const lines = new Map();
  const stack = [];
  let index = 0;
  let line = 1;

  const skipWhitespace = () => {
    while (index < source.length && /\s/.test(source[index])) {
      if (source[index] === '\n') line += 1;
      index += 1;
    }
  };

  const readString = () => {
    const start = index;
    index += 1;
    while (index < source.length) {
      const char = source[index];
      if (char === '\\') {
        index += 2;
        continue;
      }
      if (char === '"') {
        index += 1;
        break;
      }
      if (char === '\n') line += 1;
      index += 1;
    }
    return source.slice(start, index);
  };

  const takeValuePath = () => {
    const parent = stack[stack.length - 1];
    if (!parent) return [];
    if (parent.type === 'array') {
      const path = [...parent.path, parent.index];
      parent.index += 1;
      return path;
    }
    if (parent.key === null) return [...parent.path, '__invalid__'];
    const path = [...parent.path, parent.key];
    parent.key = null;
    return path;
  };

  while (index < source.length) {
    skipWhitespace();
    if (index >= source.length) break;

    const char = source[index];
    if (char === ',' || char === ':') {
      index += 1;
      continue;
    }

    if (char === '}') {
      if (stack[stack.length - 1]?.type === 'object') stack.pop();
      index += 1;
      continue;
    }
    if (char === ']') {
      if (stack[stack.length - 1]?.type === 'array') stack.pop();
      index += 1;
      continue;
    }

    if (char === '"') {
      const tokenLine = line;
      const token = readString();
      skipWhitespace();
      if (source[index] === ':' && stack[stack.length - 1]?.type === 'object') {
        try {
          stack[stack.length - 1].key = JSON.parse(token);
        } catch {
          stack[stack.length - 1].key = null;
        }
        index += 1;
        continue;
      }

      const path = takeValuePath();
      lines.set(JSON.stringify(path), tokenLine);
      continue;
    }

    if (char === '{' || char === '[') {
      const path = takeValuePath();
      lines.set(JSON.stringify(path), line);
      stack.push({
        type: char === '{' ? 'object' : 'array',
        path,
        key: null,
        index: 0,
      });
      index += 1;
      continue;
    }

    const tokenLine = line;
    while (index < source.length && !/[\s,}\]]/.test(source[index])) index += 1;
    if (index > 0) {
      const path = takeValuePath();
      lines.set(JSON.stringify(path), tokenLine);
    }
  }

  return lines;
}

// Pick the deepest tree path whose value begins at or before the requested source line.
export function findClosestPathForLine(pathLineMap, requestedLine) {
  let closestPath = null;
  let closestLine = -1;
  for (const [serializedPath, line] of pathLineMap) {
    if (line <= requestedLine && line > closestLine) {
      closestLine = line;
      closestPath = serializedPath;
    }
  }
  return closestPath;
}
