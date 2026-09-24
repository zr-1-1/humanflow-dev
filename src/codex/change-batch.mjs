import { realpath, readFile, lstat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, dirname, basename, join } from 'node:path';

export async function assertAbsent(path) {
  try { await lstat(path); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw new Error(`新增目标已存在：${path}`);
}

export function replaceExact(text, edits) {
  const ranges = edits.map(edit => {
    const normalize = value => text.includes('\r\n') ? value.replace(/\r?\n/g, '\r\n') : value.replace(/\r\n/g, '\n');
    const before = normalize(edit.before);
    const after = normalize(edit.after);
    const start = text.indexOf(before);
    if (!before || start < 0 || text.indexOf(before, start + 1) !== -1) throw new Error('原文缺失或不唯一，请重新生成带充分上下文的修改');
    return { start, end: start + before.length, after };
  }).sort((a, b) => a.start - b.start);
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i].start < ranges[i - 1].end) throw new Error('修改片段重叠');
  }
  let result = text;
  for (const edit of ranges.reverse()) result = result.slice(0, edit.start) + edit.after + result.slice(edit.end);
  return result;
}

export async function prepareBatch(root, changes, readText = path => readFile(path, 'utf8')) {
  const base = await realpath(root);
  const groups = new Map();
  const batch = [];
  for (const change of changes) {
    if (change.operation && !['edit', 'create'].includes(change.operation)) throw new Error('不支持删除或重命名操作');
    if (isAbsolute(change.path) || /^[A-Za-z]:|\\|:/.test(change.path)) throw new Error('修改路径必须为项目内的相对路径，使用 / 分隔');
    const requested = resolve(base, change.path);
    const path = change.operation === 'create' ? join(await realpath(dirname(requested)), basename(requested)) : await realpath(requested);
    const rel = relative(base, path);
    if (!rel || rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel)) throw new Error('修改路径超出项目');
    const key = process.platform === 'win32' ? path.toLowerCase() : path;
    if (change.operation === 'create') {
      if (groups.has(key) || batch.some(file => file.path === path)) throw new Error('新增文件路径重复');
      await assertAbsent(path);
      if (change.edits.length !== 1 || change.edits[0].before !== '') throw new Error('新增文件片段格式无效');
      batch.push({ path, relativePath: rel.split('\\').join('/'), operation: 'create', reason: change.reason, edits: change.edits, before: '', after: change.edits[0].after });
      continue;
    }
    if (!groups.has(key)) groups.set(key, { path, relativePath: rel.split('\\').join('/'), reasons: new Set(), edits: [] });
    const group = groups.get(key);
    group.reasons.add(change.reason);
    for (const edit of change.edits) {
      // 相同原文和结果仅保留一份；不同结果仍交由重叠校验拒绝。
      const normalized = { before: edit.before.replace(/\r\n/g, '\n'), after: edit.after.replace(/\r\n/g, '\n') };
      if (!group.edits.some(item => item.before === normalized.before && item.after === normalized.after)) group.edits.push(normalized);
    }
  }
  for (const group of groups.values()) {
    const before = await readText(group.path);
    let after;
    try { after = replaceExact(before, group.edits); }
    catch (error) { throw new Error(`${group.relativePath}：${error.message}`); }
    batch.push({ path: group.path, relativePath: group.relativePath, reason: [...group.reasons].join('\n'), edits: group.edits, before, after });
  }
  return batch;
}

export function batchChanges(batch) {
  return batch.map(file => ({ path: file.relativePath, reason: file.reason, edits: file.edits, ...(file.operation ? { operation: file.operation } : {}) }));
}

export async function assertBatchCurrent(batch, readText = path => readFile(path, 'utf8')) {
  for (const file of batch) {
    if (file.operation === 'create') {
      if (join(await realpath(dirname(file.path)), basename(file.path)) !== file.path) throw new Error('新增文件父路径变化');
      await assertAbsent(file.path); continue;
    }
    if (await realpath(file.path) !== file.path || await readText(file.path) !== file.before) {
      throw new Error(`本批建议已过期：${file.relativePath}，请重新生成`);
    }
  }
}

// 单页改动按目标文件语言渲染：改动行不带 -/+ 前缀（前缀会破坏语法着色），
// 由 VS Code 装饰标记删除/新增；表头写成该语言的注释，避免路径与范围行显示成"坏代码"。
const lineComments = {
  py: '#', pyi: '#', sh: '#', bash: '#', zsh: '#', fish: '#', yml: '#', yaml: '#', toml: '#', rb: '#', pl: '#', pm: '#', r: '#', ps1: '#', psm1: '#',
  conf: '#', cfg: '#', ini: '#', properties: '#', cmake: '#', mk: '#', makefile: '#', dockerfile: '#', tf: '#', tfvars: '#',
  js: '//', mjs: '//', cjs: '//', jsx: '//', ts: '//', tsx: '//', java: '//', c: '//', h: '//', cc: '//', cpp: '//', cxx: '//', hpp: '//', hh: '//',
  cs: '//', go: '//', rs: '//', kt: '//', kts: '//', swift: '//', php: '//', scala: '//', scss: '//', less: '//', groovy: '//', dart: '//', mm: '//',
  sql: '--', lua: '--', hs: '--', elm: '--', ada: '--', vhd: '--',
  clj: ';', cljs: ';', lisp: ';', scm: ';', el: ';',
  m: '%', css: '/*', html: '<!--', xml: '<!--', svg: '<!--', vue: '<!--', md: '<!--',
};
const commentClosers = { '/*': ' */', '<!--': ' -->' };

// 返回目标文件语言的注释写法；无法判断时返回空，表头按普通文本显示。
export function changePageComment(relativePath) {
  const name = basename(String(relativePath ?? '')).toLowerCase();
  const extension = name.includes('.') ? name.split('.').pop() : name;
  const token = lineComments[extension];
  return token ? { open: token, close: commentClosers[token] ?? '' } : { open: '', close: '' };
}

// 生成单页改动：整份文件按目标语言渲染（保留语法高亮），删除行与新增行就地插入，
// 返回文本与需要标红/标绿的行号（0 起）；markers=true 时退化为带 -/+ 前缀的文本。
export function candidateChangePage(relativePath, before, edits, { comment = { open: '', close: '' }, markers = false } = {}) {
  const toText = value => String(value ?? '').replace(/\r\n/g, '\n');
  const toLines = value => { const text = toText(value); return text === '' ? [] : text.replace(/\n$/, '').split('\n'); };
  const decorate = value => comment.open ? `${comment.open} ${value}${comment.close}` : value;
  const wrap = (mark, value) => markers ? `${mark}${value}` : value;
  const source = toText(before);
  const lines = toLines(source);
  const located = [];
  let unresolved = 0, emptyChunks = 0;
  for (const edit of edits) {
    const chunk = toText(edit?.before);
    if (chunk === '') { emptyChunks++; continue; }
    const start = source.indexOf(chunk);
    // 定位不到或原文不唯一时跳过，不猜测位置。
    if (start < 0 || source.indexOf(chunk, start + 1) !== -1) { unresolved++; continue; }
    const removedLines = toLines(chunk), addedLines = toLines(edit.after);
    // 前后一致的片段不是改动，避免在页面上显示成"删除 + 新增"。
    if (removedLines.join('\n') === addedLines.join('\n')) continue;
    located.push({
      startLine: (source.slice(0, start).match(/\n/g) ?? []).length,
      removed: removedLines,
      added: addedLines,
    });
  }
  located.sort((a, b) => a.startLine - b.startLine);
  const output = [decorate(`HumanFlow 候选改动：${relativePath}`), decorate('只读快照：整份候选代码，- 删除行 / + 新增行，尚未应用')];
  const removed = [], added = [];
  const push = (kind, value) => {
    const index = output.length;
    if (kind === 'remove') removed.push(index);
    if (kind === 'add') added.push(index);
    output.push(kind === 'same' ? value : wrap(kind === 'remove' ? '-' : '+', value));
  };
  // 新增文件：原文为空，整份内容都是新增行。
  const createPage = !lines.length && edits.length === 1 && toText(edits[0]?.before) === '';
  if (createPage) for (const line of toLines(edits[0].after)) push('add', line);
  let cursor = 0;
  for (const item of located) {
    for (let index = cursor; index < item.startLine; index++) push('same', lines[index]);
    for (const line of item.removed) push('remove', line);
    for (const line of item.added) push('add', line);
    cursor = item.startLine + item.removed.length;
  }
  for (let index = cursor; index < lines.length; index++) push('same', lines[index]);
  const skipped = unresolved + Math.max(0, emptyChunks - (createPage ? 1 : 0));
  if (skipped > 0) output.push(decorate(`有 ${skipped} 处片段无法在原文中唯一定位，未在页面中显示。`));
  return { text: `${output.join('\n')}\n`, removed, added };
}

// 语法高亮已经着色关键字、字符串、注释与数字，但虚拟文档没有语言服务器的语义着色，
// 变量名会保持默认前景色。这里做一次轻量标识符标注补足变量/属性/函数/类型颜色；
// 它是有意保守的近似：跳过关键字与字符串注释，宁可少标也不覆盖编辑器已有的颜色。
const languageKeywords = new Set(('abstract,alias,and,as,assert,async,await,bool,break,byte,case,catch,char,class,const,constexpr,continue,def,defer,del,do,double,elif,else,enum,except,export,extends,extern,false,False,finally,float,fn,for,foreach,from,func,function,global,go,goto,if,implements,import,in,instanceof,int,interface,is,lambda,let,local,long,module,namespace,new,nil,None,not,null,nullptr,or,package,pass,private,protected,public,raise,register,return,self,short,signed,sizeof,static,struct,super,switch,then,this,throw,throws,trait,true,True,try,type,typedef,typename,typeof,union,unsigned,use,using,var,virtual,void,volatile,while,with,yield').split(','));

export function identifierSpans(text, { limit = 20000 } = {}) {
  const spans = [];
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n');
  let blockEnd = '';
  for (let line = 0; line < lines.length && spans.length < limit; line++) {
    const value = lines[line];
    let index = 0;
    while (index < value.length && spans.length < limit) {
      if (blockEnd) {
        const end = value.indexOf(blockEnd, index);
        if (end < 0) { index = value.length; continue; }
        index = end + blockEnd.length; blockEnd = ''; continue;
      }
      const character = value[index];
      // # 在 Python/Ruby/Shell 里是行注释；在 C 系语言里仅用于 preprocessor，按注释跳过影响很小。
      if ((character === '/' && value[index + 1] === '/') || character === '#') break;
      if (character === '/' && value[index + 1] === '*') { blockEnd = '*/'; index += 2; continue; }
      if (value.startsWith('<!--', index)) { blockEnd = '-->'; index += 4; continue; }
      if (character === '"' || character === "'" || character === '`') {
        index++;
        while (index < value.length) {
          if (value[index] === '\\') { index += 2; continue; }
          if (value[index] === character) { index++; break; }
          index++;
        }
        continue;
      }
      if (/[A-Za-z_$]/.test(character)) {
        const start = index;
        while (index < value.length && /[A-Za-z0-9_$]/.test(value[index])) index++;
        const word = value.slice(start, index);
        if (languageKeywords.has(word)) continue;
        let next = index;
        while (next < value.length && value[next] === ' ') next++;
        const previous = value.slice(0, start).trimEnd().slice(-1);
        // 标签名（<div>）与实体引用不属于变量，跳过以免覆盖语法本身的着色。
        if (previous === '<' || previous === '&') continue;
        const kind = previous === '.' ? 'property' : value[next] === '(' ? 'function' : /^[A-Z]/.test(word) && /[a-z]/.test(word) ? 'type' : 'variable';
        spans.push({ line, start, end: index, kind });
        continue;
      }
      index++;
    }
  }
  return spans;
}

// 只给代码类文件补变量颜色：标记语言与数据格式（HTML/XML/Markdown/JSON/YAML…）的标签、属性、键
// 由语法自己着色，补标注反而会覆盖它们。
const identifierExtensions = new Set(['py', 'pyi', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'java', 'c', 'h', 'cc', 'cpp', 'cxx', 'hpp', 'hh',
  'cs', 'go', 'rs', 'kt', 'kts', 'swift', 'php', 'scala', 'dart', 'groovy', 'mm', 'm', 'sh', 'bash', 'zsh', 'fish', 'ps1', 'psm1', 'rb', 'pl',
  'pm', 'lua', 'r', 'sql', 'hs', 'elm', 'clj', 'cljs', 'lisp', 'scm', 'el', 'tf', 'tfvars', 'cmake', 'mk', 'makefile', 'dockerfile']);

export function supportsIdentifierSpans(relativePath) {
  const name = basename(String(relativePath ?? '')).toLowerCase();
  return identifierExtensions.has(name.includes('.') ? name.split('.').pop() : name);
}
