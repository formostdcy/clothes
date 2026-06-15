// cloudfunctions/employee-list/index.js
// 老板 - 员工列表
// 参数：{ page, pageSize, keyword }
// 返回：{ list, total }

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const db = cloud.database();
  const { page = 1, pageSize = 20, keyword = '' } = event;

  try {
    const where = { status: { $ne: -1 } };

    if (keyword) {
      const _ = db.command;
      // 兼容姓名/账号模糊匹配
      const reg = db.RegExp({ regexp: keyword, options: 'i' });
      // 用 $or 命中 name 或 account
      where._ = _.or([
        { name: reg },
        { account: reg },
      ]);
    }

    const countRes = await db.collection('employee').where(where).count();

    const res = await db.collection('employee')
      .where(where)
      .field({ account: true, name: true, role: true, status: true, phone: true, created_at: true })
      .orderBy('created_at', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    return {
      success: true,
      data: { list: res.data || [], total: countRes.total, page, pageSize },
    };
  } catch (e) {
    console.error('[employee-list] 失败:', e);
    return { success: false, error: e.message };
  }
};
