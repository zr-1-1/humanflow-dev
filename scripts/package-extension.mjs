import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

// 无第三方构建依赖；白名单打包，只含运行与商店展示必需文件，排除测试、文档、凭据、Git 和开发资料。
const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const entries = [];
async function add(path) { entries.push({ name: 'extension/' + path, bytes: await readFile(join(root, path)) }); }
async function walk(path) {
  for (const item of await readdir(join(root, path), { withFileTypes: true })) {
    if (item.isDirectory()) await walk(path + '/' + item.name);
    else if (item.isFile()) await add(path + '/' + item.name);
  }
}
const roots = ['package.json', 'README.md', 'LICENSE', 'CHANGELOG.md', 'icon.png'].filter(path => existsSync(join(root, path)));
for (const path of roots) await add(path);
await walk('src'); await walk('media');
const xml = value => String(value).replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]);
// 可选文件存在时才声明对应资产，避免清单指向不存在的路径。
const assets = ['<Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/>',
  '<Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true"/>'];
if (roots.includes('LICENSE')) assets.push('<Asset Type="Microsoft.VisualStudio.Services.Content.License" Path="extension/LICENSE" Addressable="true"/>');
if (roots.includes('icon.png')) assets.push('<Asset Type="Microsoft.VisualStudio.Services.Icons.Default" Path="extension/icon.png" Addressable="true"/>');
entries.push({ name: '[Content_Types].xml', bytes: Buffer.from(`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="application/json"/><Default Extension="js" ContentType="application/javascript"/><Default Extension="mjs" ContentType="application/javascript"/><Default Extension="cjs" ContentType="application/javascript"/><Default Extension="md" ContentType="text/markdown"/><Default Extension="html" ContentType="text/html"/><Default Extension="css" ContentType="text/css"/><Default Extension="png" ContentType="image/png"/><Default Extension="vsixmanifest" ContentType="text/xml"/></Types>`) });
entries.push({ name: 'extension.vsixmanifest', bytes: Buffer.from(`<?xml version="1.0" encoding="utf-8"?><PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011"><Metadata><Identity Language="en-US" Id="${xml(pkg.name)}" Version="${xml(pkg.version)}" Publisher="${xml(pkg.publisher)}"/><DisplayName>${xml(pkg.displayName)}</DisplayName><Description xml:space="preserve">${xml(pkg.description)}</Description><Tags>AI,HumanFlow</Tags><Categories>Other</Categories><GalleryFlags>Public</GalleryFlags><Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="${xml(pkg.engines.vscode)}"/><Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value=""/><Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value=""/><Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="workspace"/></Properties></Metadata><Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/><Assets>${assets.join('')}</Assets></PackageManifest>`) });
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
const local = [], central = []; let offset = 0;
for (const entry of entries) {
  const name = Buffer.from(entry.name), data = deflateRawSync(entry.bytes), crc = crc32(entry.bytes);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6); header.writeUInt16LE(8, 8);
  header.writeUInt32LE(crc, 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(entry.bytes.length, 22); header.writeUInt16LE(name.length, 26);
  const directory = Buffer.alloc(46);
  directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(0x800, 8); directory.writeUInt16LE(8, 10);
  directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(data.length, 20); directory.writeUInt32LE(entry.bytes.length, 24); directory.writeUInt16LE(name.length, 28); directory.writeUInt32LE(offset, 42);
  local.push(header, name, data); central.push(directory, name); offset += header.length + name.length + data.length;
}
const directory = Buffer.concat(central), end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
await mkdir(join(root, 'dist'), { recursive: true });
const output = join(root, 'dist', `humanflow-${pkg.version}.vsix`);
await writeFile(output, Buffer.concat([...local, directory, end]));
console.log(`${output} (${entries.length} files)`);
