const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// auth-login: 账号+密码校验,返回用户信息与角色
const crypto = require('crypto');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

exports.main = async (event, context) => {
  const db = cloud.database();
  const { account, password } = event;

  if (!account || !password) {
    return { success: false, error: 'Account and password cannot be empty' };
  }

  try {
    // Query account
    const res = await db.collection('employee') .where({
        account: account.trim(),
        status: 1, // active
      })
      .limit(1)
      .get();

    if (res.data.length === 0) {
      return { success: false, error: '账号不存在或已禁用', code: 'NO_USER' };
    }

    const user = res.data[0];
    // Verify password
    const hashedPassword = hashPassword(password);
    if (user.password !== hashedPassword) {
      return { success: false, error: '密码错误', code: 'WRONG_PWD' };
    }

    // Return user info (no password)
    const { password: _pwd, ...userInfo } = user;
    return {
      success: true,
      data: {
        _id: userInfo._id,
        name: userInfo.name,
        account: userInfo.account,
        role: userInfo.role,
        created_at: userInfo.created_at,
      },
    };
  } catch (e) {
    console.error('Login failed:', e);
    return { success: false, error: 'Login failed, please retry' };
  }
};
