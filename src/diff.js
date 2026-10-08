// 行级差异比对：找出「编辑器里的内容」相对「文件里已保存的内容」动了哪些行。
//
// 只服务于左侧行号区的改动标记，所以不需要完整的 diff 输出，只要两个行号集合：
//
//   changed       新内容里被改写或新增的行（行号直接可用）
//   deletedBefore 这一行本身没变，但它上面有内容被删掉了 —— 删除掉的行在新
//                 内容里并不存在，只能把记号留在它原本的位置附近

// 差异段的规模上限。超过就不做精细比对，整段标出来即可 —— 真正的编辑通常只占
// 很小一段（首尾相同部分已被裁掉），触发这条基本只有「整份文件被重排」这类情况，
// 此时 O(n·m) 的比对会明显卡住输入。
const FINE_DIFF_LIMIT = 4_000_000;

export function diffLines(oldText, newText) {
  const changed = new Set();
  const deletedBefore = new Set();
  if (oldText === newText) return { changed, deletedBefore };

  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  // 首尾相同的行不参与比对
  let start = 0;
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) start++;

  let oldEnd = oldLines.length - 1;
  let newEnd = newLines.length - 1;
  while (oldEnd >= start && newEnd >= start && oldLines[oldEnd] === newLines[newEnd]) {
    oldEnd--;
    newEnd--;
  }

  const a = oldLines.slice(start, oldEnd + 1);
  const b = newLines.slice(start, newEnd + 1);

  if (a.length === 0 && b.length === 0) return { changed, deletedBefore };

  if (a.length * b.length > FINE_DIFF_LIMIT) {
    for (let j = 0; j < b.length; j++) changed.add(start + j);
    if (a.length > 0) deletedBefore.add(start);
  } else {
    traceLcs(a, b, start, changed, deletedBefore);
  }

  // 一个行号只留一个记号：被替换的行算「改过」，不再重复标删除
  for (const line of changed) deletedBefore.delete(line);

  // 记号不能落在并不存在的行上（尾部删除时很容易算到最后一行的后面）
  const lastLine = newLines.length - 1;
  for (const line of [...deletedBefore]) {
    if (line > lastLine) {
      deletedBefore.delete(line);
      deletedBefore.add(Math.max(0, lastLine));
    }
  }

  return { changed, deletedBefore };
}

// 用 LCS 回溯出编辑脚本
function traceLcs(a, b, offset, changed, deletedBefore) {
  const m = a.length;
  const n = b.length;

  // dp[i][j] = a[i..] 与 b[j..] 的最长公共子序列长度
  const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (dp[i + 1][j] >= dp[i][j + 1]) {
      // a[i] 这一行没了，记号留在它原本所在的位置
      deletedBefore.add(offset + j);
      i++;
    } else {
      changed.add(offset + j);
      j++;
    }
  }

  while (j < n) {
    changed.add(offset + j);
    j++;
  }

  // 末尾多出来的行是被删掉的，新内容里找不到对应位置，记号落在差异段最后一行
  while (i < m) {
    deletedBefore.add(n > 0 ? offset + n - 1 : offset);
    i++;
  }
}
