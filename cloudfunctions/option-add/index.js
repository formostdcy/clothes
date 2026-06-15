const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 关键修复：服务端 role 校验（防止越权）
const ALLOWED_ROLES = ['老板', '原材料管理员', '裁剪管理员', '车间管理员', '成品管理员'];
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
 * 缁崵绮洪柅澶愩€� - 閺傛澘顤�
 */

exports.main = async (event, context) => {
// 关键修复：先幂等创建依赖集合（解决首次部署 -502005）
await ensureCollections();


  // 关键修复：服务端 role 校验
  const guard = await requireRole(event, ALLOWED_ROLES);
  if (!guard.ok) return { success: false, error: guard.error };

  const db = cloud.database();
  const { type, name, creator_id } = event;

  if (!type || !name) return { success: false, error: '缁鐎烽崪灞芥倳缁夐绗夐懗鎴掕礋缁�'};

  const validTypes = ['school', 'category_two', 'size', 'style', 'workshop', 'destination', 'gender', 'season'];
  if (!validTypes.includes(type)) return { success: false, error: '缁鐎锋稉宥呮値濞�'};

  try {
    // 濡偓閺屻儲妲搁崥锕€鍑＄€涙ê婀崥灞芥倳闁銆�
    const existRes = await db.collection('system_option') .where({ type, name: name.trim() })
      .count();
    if (existRes.total > 0) {
      return { success: false, error: '鐠囥儵鈧銆嶅鎻掔摠閸�'};
    }

    const res = await db.collection('system_option').add({
      data: {
        type,
        name: name.trim(),
        creator_id: creator_id || '',
        created_at: db.serverDate(),
      },
    });
    return { success: true, data: { _id: res._id } };
  } catch (e) {
    console.error('閺傛澘顤冮柅澶愩€嶆径杈Е:', e);
    return { success: false, error: '閺傛澘顤冩径杈Е' };
  }
};

/**
 * 幂等创建依赖集合
 * - 解决首次部署时 -502005 collection not exists
 */
async function ensureCollections() {
  const collections = ['system_option'];
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

