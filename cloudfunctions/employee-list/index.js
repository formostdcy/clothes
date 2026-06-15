const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 调试用：列出 employee 集合所有账号的 account / name / role / status
 * 仅在排查登录问题时临时使用，用完可删
 */
exports.main = async (event, context) => {
  const db = cloud.database();
  try {
    const res = await db.collection('employee')
      .field({ account: true, name: true, role: true, status: true })
      .limit(100)
      .get();
    return { success: true, data: res.data || [] };
  } catch (e) {
    return { success: false, error: e.message };
  }
};
