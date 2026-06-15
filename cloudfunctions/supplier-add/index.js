const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 关键修复：服务端 role 校验（防止越权）
const ALLOWED_ROLES = ['老板', '原材料管理员'];
async function requireRole(event, allowed) {
  const role = event.current_user_role || event.role;
  if (!role) {
    return { ok: false, error: '未提供用户角色（请通过前端登录态传入 current_user_role）' };
  }
  if (!allowed.includes(role)) {
    return { ok: false, error: `当前角色【${role}】无权调用此接口（仅限：${allowed.join('、')}）` };
  }
  return { ok: true };
}


/**
 * 供应商管理 - 新增
 */

/**
 * 服务端校验电话格式（同时支持手机号、座机、400/800）
 */
function isValidPhone(phone) {
  if (!phone) return false;
  const s = String(phone).trim();
  if (/^1[3-9]\d{9}$/.test(s)) return true;
  if (/^0\d{2,3}-?\d{7,8}$/.test(s)) return true;
  if (/^400-?\d{3}-?\d{4}$/.test(s)) return true;
  if (/^800-?\d{3}-?\d{4}$/.test(s)) return true;
  return false;
}

exports.main = async (event, context) => {
// 关键修复：先幂等创建依赖集合（解决首次部署 -502005）
await ensureCollections();


  // 关键修复：服务端 role 校验
  const guard = await requireRole(event, ALLOWED_ROLES);
  if (!guard.ok) return { success: false, error: guard.error };

  const db = cloud.database();
  const { name, contact_name, contact_phone } = event;

  if (!name || !String(name).trim()) {
    return { success: false, error: '请填写供应商名称' };
  }
  if (contact_phone && !isValidPhone(contact_phone)) {
    return { success: false, error: '电话格式不正确' };
  }

  try {
    const res = await db.collection('supplier').add({
      data: {
        name: name.trim(),
        contact_name: contact_name || '',
        contact_phone: contact_phone || '',
        created_at: db.serverDate(),
        updated_at: db.serverDate(),
      },
    });
    return { success: true, data: { _id: res._id } };
  } catch (e) {
    console.error('新增供应商失败', e);
    return { success: false, error: '新增失败' };
  }
};

/**
 * 幂等创建依赖集合
 * - 解决首次部署时 -502005 collection not exists
 */
async function ensureCollections() {
  const collections = ['supplier'];
  for (const name of collections) {
    try {
      await cloud.database().createCollection(name);
      console.log(`[ensureCollections] 已创建集合 ${name}`);
    } catch (e) {
      const msg = (e && (e.errMsg || e.message)) || '';
      if (/already exists|ResourceExists/i.test(msg)) continue;
      console.error(`[ensureCollections] 创建集合 ${name} 失败:`, e);
    }
  }
}

