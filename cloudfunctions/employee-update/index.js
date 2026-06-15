const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * employee-update - update employee info
 */

const crypto = require('crypto');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

exports.main = async (event, context) => {
  const db = cloud.database();
  const { _id, name, account, password, role, status } = event;

  if (!_id) {
    return { success: false, error: '员工ID不能为空' };
  }

  const roles = ['原材料管理员', '裁剪管理员', '车间管理员', '成品管理员', '老板'];
  if (role && !roles.includes(role)) {
    return { success: false, error: '角色不合法' };
  }

  try {
    const updateData = {
      updated_at: db.serverDate(),
    };
    if (name) updateData.name = name.trim();
    if (account) updateData.account = account.trim();
    if (password) updateData.password = hashPassword(password);
    if (role) updateData.role = role;
    if (status !== undefined) updateData.status = status;

    await db.collection('employee').doc(_id).update({ data: updateData });
    return { success: true };
  } catch (e) {
    console.error('employee-update error:', e);
    return { success: false, error: '更新失败: ' + (e.message || '未知错误') };
  }
};
