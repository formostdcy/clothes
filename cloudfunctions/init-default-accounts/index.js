const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 一键初始化：自动建集合 + 插入/重置默认账号 + 插入系统选项
 * 幂等运行，可重复执行
 *
 * 用法:
 *   { action: 'all' }              // 一次跑完 (15集+5账号+14选项)
 *   { action: 'collections' }      // 只建集合
 *   { action: 'accounts' }         // 只插账号
 *   { action: 'options' }          // 只插选项
 *   { action: 'reset' }            // 按 account 字段删除并重建默认账号
 *   { action: 'force-reset' }      // 【最狠】按 role 字段删除所有同角色账号再重建（保准能重置）
 *   { action: 'inspect' }          // 【诊断】列出数据库里所有员工账号，不改任何数据
 */
const crypto = require('crypto');

function hashPassword(pwd) {
  return crypto.createHash('sha256').update(pwd).digest('hex');
}

const COLLECTIONS = [
  'employee',
  'supplier',
  'raw_material_stock',
  'raw_inbound_order',
  'raw_outbound_order',
  'cutting_incoming_confirm',
  'workshop_incoming_confirm',
  'cutting_order',
  'workshop_order_confirm',
  'processing_order',
  'finished_product_confirm',
  'finished_product_stock',
  'finished_outbound_order',
  'notification',
  'system_option',
];

const DEFAULT_ACCOUNTS = [
  { account: 'boss',           password: 'boss123',     name: '系统管理员',   role: '老板' },
  { account: 'raw_admin',      password: 'raw123',      name: '原材料管理员', role: '原材料管理员' },
  { account: 'cutting_admin',  password: 'cutting123',  name: '裁剪管理员',   role: '裁剪管理员' },
  { account: 'workshop_admin', password: 'workshop123', name: '车间管理员',   role: '车间管理员' },
  { account: 'finished_admin', password: 'finished123', name: '成品管理员',   role: '成品管理员' },
];

const DEFAULT_OPTIONS = [
  { type: 'size', name: 'S' },
  { type: 'size', name: 'M' },
  { type: 'size', name: 'L' },
  { type: 'size', name: 'XL' },
  { type: 'size', name: 'XXL' },
  { type: 'gender', name: '男' },
  { type: 'gender', name: '女' },
  { type: 'gender', name: '男女同款' },
  { type: 'style', name: '夏装' },
  { type: 'style', name: '冬装' },
  { type: 'style', name: '春秋装' },
  { type: 'destination', name: '本校仓库' },
  { type: 'destination', name: '客户自提' },
  { type: 'school', name: '示例学校' },
];

async function ensureCollection(db, name) {
  try {
    await db.collection(name).count();
    return { name, action: 'exists' };
  } catch (e) {
    const msg = e.message || '';
    if (e.errCode === -502005 || msg.includes('not exists') || msg.includes('Db or Table not exist')) {
      try {
        await db.createCollection(name);
        return { name, action: 'created' };
      } catch (e2) {
        return { name, action: 'create_failed', error: e2.message };
      }
    }
    return { name, action: 'check_failed', error: msg };
  }
}

async function initCollections(db) {
  const results = await Promise.all(COLLECTIONS.map(n => ensureCollection(db, n)));
  return results;
}

async function insertDefaultAccount(db, item) {
  await db.collection('employee').add({
    data: {
      name: item.name,
      account: item.account,
      password: hashPassword(item.password),
      role: item.role,
      status: 1,
      created_at: db.serverDate(),
    },
  });
}

async function initAccounts(db, force = false) {
  const created = [];
  const skipped = [];
  const reset = [];
  const tasks = DEFAULT_ACCOUNTS.map(async (item) => {
    try {
      const existRes = await db.collection('employee').where({ account: item.account })
        .limit(1)
        .get();

      if (existRes.data.length > 0) {
        if (force) {
          await db.collection('employee').doc(existRes.data[0]._id).remove();
        } else {
          skipped.push({ account: item.account, reason: '已存在' });
          return;
        }
      }

      await insertDefaultAccount(db, item);
      if (force) {
        reset.push({ account: item.account, role: item.role, default_password: item.password });
      } else {
        created.push({ account: item.account, role: item.role, default_password: item.password });
      }
    } catch (e) {
      skipped.push({ account: item.account, reason: e.message });
    }
  });
  await Promise.all(tasks);
  return { created, skipped, reset };
}

/**
 * 强制重置：按 role 删除所有同角色账号，再插入默认账号
 * 不管之前 account 字段被改成了什么，都能清掉
 */
async function forceResetAccounts(db) {
  const reset = [];
  const removed = [];
  const tasks = DEFAULT_ACCOUNTS.map(async (item) => {
    try {
      // 按 role 字段查找（role 不会被用户改）
      const existRes = await db.collection('employee').where({ role: item.role })
        .limit(100)
        .get();

      if (existRes.data.length > 0) {
        for (const old of existRes.data) {
          await db.collection('employee').doc(old._id).remove();
          removed.push({ _id: old._id, old_account: old.account, old_name: old.name, role: old.role });
        }
      }

      await insertDefaultAccount(db, item);
      reset.push({
        account: item.account,
        role: item.role,
        default_password: item.password,
        removed_count: existRes.data.length,
      });
    } catch (e) {
      reset.push({ account: item.account, role: item.role, error: e.message });
    }
  });
  await Promise.all(tasks);
  return { reset, removed };
}

/**
 * 诊断：列出数据库里所有员工账号（不含 password 哈希）
 */
async function inspectAccounts(db) {
  try {
    const res = await db.collection('employee').limit(100).get();
    return res.data.map(u => ({
      _id: u._id,
      account: u.account,
      name: u.name,
      role: u.role,
      status: u.status,
      created_at: u.created_at,
    }));
  } catch (e) {
    return { error: e.message };
  }
}

async function initOptions(db) {
  const created = [];
  const skipped = [];
  const tasks = DEFAULT_OPTIONS.map(async (opt) => {
    try {
      const existRes = await db.collection('system_option').where({ type: opt.type, name: opt.name })
        .limit(1)
        .get();

      if (existRes.data.length > 0) {
        skipped.push(opt);
        return;
      }

      await db.collection('system_option').add({
        data: {
          type: opt.type,
          name: opt.name,
          creator_id: '',
          created_at: db.serverDate(),
        },
      });
      created.push(opt);
    } catch (e) {
      skipped.push({ ...opt, error: e.message });
    }
  });
  await Promise.all(tasks);
  return { created, skipped };
}

exports.main = async (event) => {
  const db = cloud.database();
  const action = (event && event.action) || 'all';

  const result = { success: true, data: {} };

  if (action === 'all' || action === 'collections') {
    result.data.collections = await initCollections(db);
  }
  if (action === 'force-reset') {
    result.data.accounts = await forceResetAccounts(db);
  } else if (action === 'reset') {
    result.data.accounts = await initAccounts(db, true);
  } else if (action === 'inspect') {
    result.data.accounts = await inspectAccounts(db);
  } else if (action === 'all' || action === 'accounts') {
    result.data.accounts = await initAccounts(db, false);
  }
  if (action === 'all' || action === 'options') {
    result.data.options = await initOptions(db);
  }

  // 汇总
  const createdCols = (result.data.collections || []).filter(c => c.action === 'created').length;
  const acc = result.data.accounts || { created: [], skipped: [], reset: [], removed: [] };
  const createdAcc = (acc.created || []).length;
  const resetAcc = (acc.reset || []).length;
  const removedAcc = (acc.removed || []).length;
  const createdOpt = (result.data.options || []).length && result.data.options.created ? result.data.options.created.length : 0;

  result.data.message = `集合: 新建 ${createdCols} | 账号: 新建 ${createdAcc} / 重置 ${resetAcc} (删除 ${removedAcc} 条) | 选项: 新建 ${createdOpt}`;
  return result;
};
