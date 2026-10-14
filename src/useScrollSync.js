import { useCallback, useMemo, useRef } from 'react';
import { buildJsonPathLineMap, findClosestPathForLine } from './scrollSync';

const DEFAULT_LINE_HEIGHT = 21.45;
const TREE_SCROLL_OFFSET = 8;

export default function useScrollSync({ code, textareaRef, lineNumbersRef, treeViewportRef }) {
  const pathLineMap = useMemo(() => buildJsonPathLineMap(code), [code]);
  const isScrollingRef = useRef(false);

  // 动态获取代码区行高（避免硬编码与 CSS 不一致）（M1）
  const getLineHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return DEFAULT_LINE_HEIGHT; // 回退默认值：13px * 1.65
    const lh = parseFloat(window.getComputedStyle(ta).lineHeight);
    return isNaN(lh) || lh === 0 ? DEFAULT_LINE_HEIGHT : lh;
  }, []);

  // 获取代码区第一个可见行号
  const getFirstVisibleLine = useCallback((textarea) => {
    return Math.floor(textarea.scrollTop / getLineHeight()) + 1;
  }, [getLineHeight]);

  // 滚动树形视图到源代码当前行对应的 JSON 路径。
  const scrollTreeToLine = useCallback((line) => {
    if (!treeViewportRef.current) return;
    const serializedPath = findClosestPathForLine(pathLineMap, line);
    if (serializedPath === null) return;
    const treeViewport = treeViewportRef.current;
    const targetNode = document.getElementById(`tree-path-${encodeURIComponent(serializedPath)}`);
    if (!targetNode || !treeViewport.contains(targetNode)) return;

    const treeRect = treeViewport.getBoundingClientRect();
    const nodeRect = targetNode.getBoundingClientRect();
    const offset = nodeRect.top - treeRect.top + treeViewport.scrollTop - TREE_SCROLL_OFFSET;
    treeViewport.scrollTop = Math.max(0, offset);
  }, [pathLineMap]);

  const handleEditorScroll = useCallback((e) => {
    // 行号同步
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = e.target.scrollTop;
    }
    // 树形视图同步滚动（分屏模式下，用行号对应同步）
    if (treeViewportRef.current && !isScrollingRef.current) {
      isScrollingRef.current = true;
      const line = getFirstVisibleLine(e.target);
      scrollTreeToLine(line);
      requestAnimationFrame(() => { isScrollingRef.current = false; });
    }
  }, [getFirstVisibleLine, scrollTreeToLine]);

  const handleTreeScroll = useCallback((e) => {
    const textarea = textareaRef.current;
    if (textarea && !isScrollingRef.current) {
      isScrollingRef.current = true;
      // 通过可见节点的 JSON 路径反查源代码行，不再把树节点序号误当作文本行号。
      const treeViewport = e.target;
      const nodes = treeViewport.querySelectorAll('[data-path]');
      const treeRect = treeViewport.getBoundingClientRect();
      let firstVisibleLine = 1;
      for (const node of nodes) {
        const nodeRect = node.getBoundingClientRect();
        if (nodeRect.bottom > treeRect.top) {
          firstVisibleLine = pathLineMap.get(node.dataset.path) || 1;
          break;
        }
      }
      // 滚动代码区到对应行
      textarea.scrollTop = (firstVisibleLine - 1) * getLineHeight();
      if (lineNumbersRef.current) {
        lineNumbersRef.current.scrollTop = textarea.scrollTop;
      }
      requestAnimationFrame(() => { isScrollingRef.current = false; });
    }
  }, [getLineHeight, pathLineMap]);

  return { handleEditorScroll, handleTreeScroll };
}
