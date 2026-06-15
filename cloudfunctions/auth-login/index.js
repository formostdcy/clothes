const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// auth-login: 账号+密码校验,返回用户信息与角色
const crypto = require('crypto');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * 关键诊断日志 - 体验版登录卡住时,看云函数日志能看到这里
 */
exports.main = async (event, context) => {
  const startTime = Date.now();
  console.log('[auth-login] ========== 开始 ==========');
  console.log('[auth-login] 入参 account=', event && event.account, ' passwordLen=', (event && event.password || '').length);
  console.log('[auth-login] OPENID=', (context && context.OPENID) || 'unknown');
  console.log('[auth-login] ENV=', cloud.DYNAMIC_CURRENT_ENV);

  const db = cloud.database();
  const { account, password } = event;

  if (!account || !password) {
    console.log('[auth-login] 失败: 账号或密码为空');
    return { success: false, error: 'Account and password cannot be empty', code: 'EMPTY' };
  }

  try {
    // 关键修复：先确保 employee 集合存在（解决首次部署 -502005）
    try {
      await db.collection('employee').count();
    } catch (e) {
      const msg = e.message || '';
      if (e.errCode === -502005 || /not exists/i.test(msg)) {
        console.log('[auth-login] employee 集合不存在,自动创建...');
        await db.createCollection('employee');
        console.log('[auth-login] employee 集合已创建');
      } else {
        throw e;
      }
    }

    // Query account
    const res = await db.collection('employee').where({
        account: account.trim(),
        status: 1, // active
      })
      .limit(1)
      .get();

    console.log('[auth-login] 数据库查询完成, 耗时=', Date.now() - startTime, 'ms, 命中数=', res.data.length);

    if (res.data.length === 0) {
      console.log('[auth-login] 失败: 账号不存在或已禁用, account=', account.trim());
      // 关键诊断:帮用户定位问题 - 看看库里到底有哪些账号
      const allRes = await db.collection('employee').limit(20).get();
      const accounts = (allRes.data || []).map(u => `${u.account}(${u.role || '无角色'})`).join(', ');
      console.log('[auth-login] 数据库现有账号(前20个):', accounts || '(空)');
      return {
        success: false,
        error: '账号不存在或已禁用',
        code: 'NO_USER',
        diagnosis: `【账号"${account.trim()}"在数据库中找不到】\n` +
          `库里现有账号(前20个): ${accounts || '(空 - 还没初始化)'}\n\n` +
          `修复: 在云开发控制台 → 云函数 → 找到 init-default-accounts → 运行 { action: 'accounts' }\n` +
          `会自动创建 boss/boss123, raw_admin/raw123 等 5 个测试账号`,
      };
    }

    const user = res.data[0];
    // Verify password
    const hashedPassword = hashPassword(password);
    console.log('[auth-login] 密码哈希计算完成, 数据库哈希前8位=', (user.password || '').slice(0, 8), '...');
    if (user.password !== hashedPassword) {
      console.log('[auth-login] 失败: 密码错误, 输入哈希前8位=', hashedPassword.slice(0, 8), '...');
      return {
        success: false,
        error: '密码错误',
        code: 'WRONG_PWD',
        diagnosis: `【密码不匹配】\n` +
          `你输入的密码: ${'*'.repeat((password || '').length)} (${(password || '').length}位)\n` +
          `账号 "${user.account}" 数据库里存的密码哈希前8位: ${(user.password || '').slice(0, 8)}...\n\n` +
          `可能原因:\n` +
          `1. 密码确实不对,默认是 boss123\n` +
          `2. 数据库里这条账号是用 force-reset 重置过的,密码可能是别的\n` +
          `3. 解决: 在云开发控制台 → 云函数 → init-default-accounts → 运行 { action: 'force-reset' } 重置所有默认账号`,
      };
    }

    // Return user info (no password)
    const { password: _pwd, ...userInfo } = user;
    console.log('[auth-login] 成功! 用户:', userInfo.account, '角色:', userInfo.role, '总耗时=', Date.now() - startTime, 'ms');
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
    console.error('[auth-login] 异常:', e);
    return {
      success: false,
      error: 'Login failed, please retry: ' + (e.message || String(e)),
      code: 'EXCEPTION',
      diagnosis: `【云函数内部异常】\n` +
        `异常信息: ${e.message || e}\n` +
        `errCode: ${e.errCode || 'N/A'}\n\n` +
        `可能原因:\n` +
        `1. 数据库权限没配置(集合权限应该设为"所有用户可读,仅创建者可写")\n` +
        `2. cloud.init 环境 ID 错误\n` +
        `3. 云函数代码本身有 bug - 把上面的 errCode 发给我看`,
    };
  }
};
