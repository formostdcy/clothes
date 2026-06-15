/**
 * 权限白名单自检脚本（开发期使用）
 *
 * 列出所有页面调用的云函数，对照 auth-guard.js 的白名单分类：
 * - PUBLIC：放行
 * - BOSS_ONLY：只老板
 * - 其他：默认放行（业务函数）
 *
 * 用法：node check-permissions.js
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const PAGES_DIR = path.join(PROJECT_ROOT, 'pages');
const GUARD_FILE = path.join(PROJECT_ROOT, 'utils', 'auth-guard.js');

const guardContent = fs.readFileSync(GUARD_FILE, 'utf-8');
const publicMatch = guardContent.match(/PUBLIC_FUNCS = new Set\(\[(.*?)\]\)/s);
const bossMatch = guardContent.match(/BOSS_ONLY_FUNCS = new Set\(\[(.*?)\]\)/s);

const PUBLIC = new Set();
publicMatch[1].split(/['",\s]+/).forEach(s => s.trim() && PUBLIC.add(s));

const BOSS = new Set();
bossMatch[1].split(/['",\s]+/).forEach(s => s.trim() && BOSS.add(s));

// 解析 ROLE_PERMISSIONS
const roleMatch = guardContent.match(/ROLE_PERMISSIONS = \{(.*?)^\};/sm);
const ROLE_PERMS = {};
if (roleMatch) {
  const block = roleMatch[1];
  // 提取每个角色的 Set
  const roleRe = /'([^']+)':\s*new Set\(\[(.*?)\]\)/gs;
  let m;
  while ((m = roleRe.exec(block)) !== null) {
    const role = m[1];
    const fns = new Set();
    m[2].split(/['",\s]+/).forEach(s => s.trim() && fns.add(s));
    ROLE_PERMS[role] = fns;
  }
}

// 扫描所有页面引用的云函数
const usedFns = new Set();
function walk(dir) {
  fs.readdirSync(dir).forEach(f => {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      walk(p);
    } else if (p.endsWith('.js')) {
      const content = fs.readFileSync(p, 'utf-8');
      const matches = content.matchAll(/callCloud\(\s*['"]([\w-]+)['"]/g);
      for (const m of matches) {
        usedFns.add(m[1]);
      }
    }
  });
}
walk(PAGES_DIR);

// 分类
const inPublic = [];
const inBoss = [];
const inRole = {};
['原材料管理员', '裁剪管理员', '车间管理员', '成品管理员'].forEach(r => inRole[r] = []);
const unclassified = [];

usedFns.forEach(fn => {
  if (PUBLIC.has(fn)) inPublic.push(fn);
  else if (BOSS.has(fn)) inBoss.push(fn);
  else {
    let matched = false;
    for (const role of Object.keys(inRole)) {
      if (ROLE_PERMS[role] && ROLE_PERMS[role].has(fn)) {
        inRole[role].push(fn);
        matched = true;
        break;
      }
    }
    if (!matched) unclassified.push(fn);
  }
});

console.log('=== 公共白名单（所有人都能调）===');
inPublic.sort().forEach(fn => console.log('  ✓ ' + fn));
console.log(`共 ${inPublic.length} 个`);

console.log('\n=== 老板专属（只有老板能调）===');
inBoss.sort().forEach(fn => console.log('  🔒 ' + fn));
console.log(`共 ${inBoss.length} 个`);

for (const role of Object.keys(inRole)) {
  console.log(`\n=== ${role} 专属（共 ${inRole[role].length} 个）===`);
  inRole[role].sort().forEach(fn => console.log('  👤 ' + fn));
}

console.log('\n=== 未分类（无角色白名单，默认会拦截）===');
if (unclassified.length === 0) {
  console.log('  ✅ 全部已分类');
} else {
  unclassified.sort().forEach(fn => console.log('  ❓ ' + fn));
  console.log(`共 ${unclassified.length} 个`);
}
