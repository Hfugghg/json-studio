// GitHub Pages 构建后处理：写入 .nojekyll，跳过 Jekyll 处理，
// 避免下划线开头的文件被吞掉。
import { writeFileSync } from 'node:fs';

writeFileSync('docs/.nojekyll', '');
console.log('已写入 docs/.nojekyll');
