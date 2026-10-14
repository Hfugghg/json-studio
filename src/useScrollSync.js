import { useCallback, useEffect, useMemo, useRef } from 'react';
import { buildJsonPathLineMap, findClosestPathForLine } from './scrollSync';

const DEFAULT_LINE_HEIGHT = 21.45;
const TREE_SCROLL_OFFSET = 8;
const SCROLL_EPSILON = 1;

export function setScrollTopWithoutEcho(element, expectedScrollRef, nextTop) {
  if (!element || Math.abs(element.scrollTop - nextTop) < SCROLL_EPSILON) return false;

  // Mark the target before assigning scrollTop. Its resulting scroll event is an
  // echo of this update, not a new user gesture, and must not sync back.
  element.scrollTop = nextTop;
  expectedScrollRef.current = element.scrollTop;
  return true;
}

export function consumeProgrammaticScroll(element, expectedScrollRef) {
  const expected = expectedScrollRef.current;
  if (expected === null) return false;

  // Scroll positions are clamped by the browser, so compare against the actual
  // resulting position rather than the requested one.
  if (Math.abs(element.scrollTop - expected) <= SCROLL_EPSILON) {
    expectedScrollRef.current = null;
    return true;
  }

  // The position differs: the user likely interrupted the programmatic scroll.
  expectedScrollRef.current = null;
  return false;
}

export default function useScrollSync({ code, textareaRef, lineNumbersRef, treeViewportRef }) {
  const pathLineMap = useMemo(() => buildJsonPathLineMap(code), [code]);
  const expectedEditorScrollRef = useRef(null);
  const expectedTreeScrollRef = useRef(null);
  const editorFrameRef = useRef(0);
  const treeFrameRef = useRef(0);

  const getLineHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return DEFAULT_LINE_HEIGHT;
    const lineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight);
    return Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : DEFAULT_LINE_HEIGHT;
  }, [textareaRef]);

  const getFirstVisibleLine = useCallback((textarea) => (
    Math.floor(textarea.scrollTop / getLineHeight()) + 1
  ), [getLineHeight]);

  const scrollTreeToLine = useCallback((line) => {
    const treeViewport = treeViewportRef.current;
    if (!treeViewport) return;

    const serializedPath = findClosestPathForLine(pathLineMap, line);
    if (serializedPath === null) return;

    const targetNode = document.getElementById(`tree-path-${encodeURIComponent(serializedPath)}`);
    if (!targetNode || !treeViewport.contains(targetNode)) return;

    const treeRect = treeViewport.getBoundingClientRect();
    const nodeRect = targetNode.getBoundingClientRect();
    const targetTop = nodeRect.top - treeRect.top + treeViewport.scrollTop - TREE_SCROLL_OFFSET;
    setScrollTopWithoutEcho(treeViewport, expectedTreeScrollRef, Math.max(0, targetTop));
  }, [pathLineMap, treeViewportRef]);

  const handleEditorScroll = useCallback((event) => {
    const textarea = event.currentTarget || event.target;

    // Ignore the scroll event caused by syncing from the tree back to the editor.
    if (consumeProgrammaticScroll(textarea, expectedEditorScrollRef)) return;

    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textarea.scrollTop;
    }

    // Coalesce high-frequency touchpad/wheel events to one sync per animation frame.
    if (editorFrameRef.current) cancelAnimationFrame(editorFrameRef.current);
    editorFrameRef.current = requestAnimationFrame(() => {
      editorFrameRef.current = 0;
      if (textareaRef.current !== textarea) return;
      scrollTreeToLine(getFirstVisibleLine(textarea));
    });
  }, [getFirstVisibleLine, lineNumbersRef, scrollTreeToLine, textareaRef]);

  const handleTreeScroll = useCallback((event) => {
    const treeViewport = event.currentTarget || event.target;

    // Ignore the scroll event caused by syncing from the editor to the tree.
    if (consumeProgrammaticScroll(treeViewport, expectedTreeScrollRef)) return;

    if (treeFrameRef.current) cancelAnimationFrame(treeFrameRef.current);
    treeFrameRef.current = requestAnimationFrame(() => {
      treeFrameRef.current = 0;
      const textarea = textareaRef.current;
      if (!textarea || treeViewportRef.current !== treeViewport) return;

      // Resolve the first visible tree row to its source line. The tree has fewer
      // rows than the source, so this is an anchor mapping rather than 1:1 lines.
      const nodes = treeViewport.querySelectorAll('[data-path]');
      const treeRect = treeViewport.getBoundingClientRect();
      let sourceLine = 1;

      for (const node of nodes) {
        const nodeRect = node.getBoundingClientRect();
        if (nodeRect.bottom > treeRect.top) {
          sourceLine = pathLineMap.get(node.dataset.path) || 1;
          break;
        }
      }

      const targetTop = Math.max(0, (sourceLine - 1) * getLineHeight());
      setScrollTopWithoutEcho(textarea, expectedEditorScrollRef, targetTop);
      if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = textarea.scrollTop;
    });
  }, [getLineHeight, lineNumbersRef, pathLineMap, textareaRef, treeViewportRef]);

  useEffect(() => () => {
    if (editorFrameRef.current) cancelAnimationFrame(editorFrameRef.current);
    if (treeFrameRef.current) cancelAnimationFrame(treeFrameRef.current);
  }, []);

  return { handleEditorScroll, handleTreeScroll };
}
