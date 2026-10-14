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

  const takeValuePath = (sourceValueLine = line) => {
    const parent = stack[stack.length - 1];
    if (!parent) return { path: [], valueLine: sourceValueLine };
    if (parent.type === 'array') {
      const path = [...parent.path, parent.index];
      parent.index += 1;
      return { path, valueLine: sourceValueLine };
    }
    if (parent.key === null) return { path: [...parent.path, '__invalid__'], valueLine: sourceValueLine };
    const path = [...parent.path, parent.key];
    const valueLine = parent.keyLine ?? line;
    parent.key = null;
    parent.keyLine = null;
    return { path, valueLine };
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
          stack[stack.length - 1].keyLine = tokenLine;
        } catch {
          stack[stack.length - 1].key = null;
          stack[stack.length - 1].keyLine = tokenLine;
        }
        index += 1;
        continue;
      }

      const { path, valueLine } = takeValuePath(tokenLine);
      lines.set(JSON.stringify(path), valueLine);
      continue;
    }

    if (char === '{' || char === '[') {
      const { path, valueLine } = takeValuePath();
      lines.set(JSON.stringify(path), valueLine);
      stack.push({
        type: char === '{' ? 'object' : 'array',
        path,
        key: null,
        keyLine: null,
        index: 0,
      });
      index += 1;
      continue;
    }

    const tokenLine = line;
    while (index < source.length && !/[\s,}\]]/.test(source[index])) index += 1;
    if (index > 0) {
      const { path, valueLine } = takeValuePath(tokenLine);
      lines.set(JSON.stringify(path), valueLine);
    }
  }

  return lines;
}

// Build a line index once per parsed source map, then use binary search during scrolling.
const lineIndexCache = new WeakMap();

export function findClosestPathForLine(pathLineMap, requestedLine) {
  let lineIndex = lineIndexCache.get(pathLineMap);
  if (!lineIndex) {
    const firstPathByLine = new Map();
    for (const [serializedPath, line] of pathLineMap) {
      if (!firstPathByLine.has(line)) firstPathByLine.set(line, serializedPath);
    }
    lineIndex = [...firstPathByLine.entries()]
      .map(([line, serializedPath]) => ({ line, serializedPath }))
      .sort((a, b) => a.line - b.line);
    lineIndexCache.set(pathLineMap, lineIndex);
  }

  let low = 0;
  let high = lineIndex.length - 1;
  let match = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (lineIndex[middle].line <= requestedLine) {
      match = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return match < 0 ? null : lineIndex[match].serializedPath;
}
