import { describe, it, expect } from 'vitest';
import { buildJsonPathLineMap, findClosestPathForLine } from '../scrollSync';

describe('JSON source/tree path mapping', () => {
  it('maps nested objects and array items to source lines', () => {
    const source = [
      '{',
      '  "name": "text with \\"quoted\\": and ]",',
      '  "items": [',
      '    {"id": 1},',
      '    false',
      '  ],',
      '  "empty": {}',
      '}',
    ].join('\n');
    const map = buildJsonPathLineMap(source);

    expect(map.get(JSON.stringify([]))).toBe(1);
    expect(map.get(JSON.stringify(['name']))).toBe(2);
    expect(map.get(JSON.stringify(['items']))).toBe(3);
    expect(map.get(JSON.stringify(['items', 0]))).toBe(4);
    expect(map.get(JSON.stringify(['items', 0, 'id']))).toBe(4);
    expect(map.get(JSON.stringify(['items', 1]))).toBe(5);
    expect(map.get(JSON.stringify(['empty']))).toBe(7);
  });

  it('works with minified JSON and escaped keys', () => {
    const map = buildJsonPathLineMap('{"a\\\"b":[1,{"c":true}]}');

    expect(map.get(JSON.stringify([]))).toBe(1);
    expect(map.get(JSON.stringify(['a"b']))).toBe(1);
    expect(map.get(JSON.stringify(['a"b', 0]))).toBe(1);
    expect(map.get(JSON.stringify(['a"b', 1, 'c']))).toBe(1);
  });

  it('finds the closest preceding path for closing-bracket lines', () => {
    const map = buildJsonPathLineMap('{\n  "a": [\n    1\n  ]\n}');
    expect(findClosestPathForLine(map, 4)).toBe(JSON.stringify(['a', 0]));
    expect(findClosestPathForLine(map, 5)).toBe(JSON.stringify(['a', 0]));
    expect(findClosestPathForLine(map, 0)).toBeNull();
  });
});
