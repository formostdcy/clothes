const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 系统选项 - 列表
 * 入参：{ type?, keyword? }
 * 返回：{ success: true, data: [...] }
 */

const VALID_TYPES = ['school', 'category_two', 'size', 'style', 'workshop', 'destination', 'gender', 'season'];

exports.main = async (event, context) => {
  const db = cloud.database();
  const { type = '', keyword = '' } = event;

  try {
    const where = {};

    if (type) {
      if (!VALID_TYPES.includes(type)) {
        return { success: false, error: '选项类型不合法' };
      }
      where.type = type;
    }

    let query = db.collection('system_option').where(where);

    // keyword 过滤（name 包含）
    if (keyword && keyword.trim()) {
      const reg = db.RegExp({ regexp: keyword.trim(), options: 'i' });
      // 用复合条件：type + name regexp
      // 注意：云开发 where 复合用 and
      query = db.collection('system_option').where({
        ...where,
        name: reg,
      });
    }

    const res = await query.orderBy('sort', 'asc').orderBy('created_at', 'asc').limit(500).get();

    return { success: true, data: res.data };
  } catch (e) {
    console.error('选项列表查询失败:', e);
    return { success: false, error: '查询失败：' + e.message };
  }
};
