const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * employee-add - add new employee
 */

const crypto = require('crypto');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

exports.main = async (event, context) => {
  const db = cloud.database();
  const { name, account, password, role } = event;

  if (!name || !account || !password || !role) {
    return { success: false, error: '请填写完整信息' };
  }

  const roles = ['原材料管理员', '裁剪管理员', '车间管理员', '成品管理员', '老板'];
  if (!roles.includes(role)) {
    return { success: false, error: '角色不合法' };
  }

  try {
    const existRes = await db.collection('employee').where({ account: account.trim() }).count();
    if (existRes.total > 0) {
      return { success: false, error: '账号已存在' };
    }

    const res = await db.collection('employee').add({
      data: {
        name: name.trim(),
        account: account.trim(),
        password: hashPassword(password),
        role,
        status: 1,
        created_at: db.serverDate(),
      },
    });

    return { success: true, data: { _id: res._id } };
  } catch (e) {
    console.error('employee-add error:', e);
    return { success: false, error: '添加失败: ' + (e.message || '未知错误') };
  }
};
