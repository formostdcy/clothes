/**
 * 请求封装工具
 */

const app = getApp();
const { checkPermission } = require('./auth-guard.js');

/**
 * 统一云函数调用（带权限校验）
 * @param {string} name - 云函数名称
 * @param {object} data - 请求参数
 * @param {boolean|object} showLoading - 是否显示loading；传入 { silent: true } 时不自动弹错误 toast
 */
function callCloud(name, data = {}, showLoading = true) {
  const loadingOpt = (typeof showLoading === 'object') ? showLoading : { silent: false };
  const shouldShowLoading = !!showLoading && (typeof showLoading === 'boolean' || showLoading.showLoading !== false);
  const silent = loadingOpt.silent === true;

  // ========== 权限校验（前端第一道防线） ==========
  // 注意：这是前端校验，只能挡住普通用户；
  // 真正的安全靠云函数 server 端校验。
  if (!checkPermission(name)) {
    const err = `无权调用 ${name}`;
    console.error(`[callCloud] ${err}`);
    if (!silent) {
      wx.showToast({ title: '无权访问该功能', icon: 'none', duration: 2000 });
    }
    return Promise.reject(err);
  }

  // 关键修复：自动注入 current_user_role / current_user_id 给云函数服务端做 role 校验
  // （之前云函数完全无服务端权限校验，已在所有写云函数中加 requireRole）
  const userInfo = (app && app.getUserInfo && app.getUserInfo()) || {};
  const dataWithRole = Object.assign({}, data, {
    current_user_role: userInfo.role || '',
    current_user_id: userInfo._id || '',
  });

  if (shouldShowLoading) {
    app.showLoading();
  }
  return wx.cloud.callFunction({
    name,
    data: dataWithRole,
  }).then(res => {
    if (shouldShowLoading) {
      app.hideLoading();
    }
    if (res.result) {
      if (res.result.success) {
        return res.result.data;
      } else {
        // 把整个 result 传出去，方便前端拿到 stockFailInfo 等结构化错误
        const failErr = new Error(res.result.error || '操作失败');
        failErr.result = res.result;
        if (!silent) {
          wx.showToast({
            title: res.result.error || '操作失败',
            icon: 'none',
            duration: 2000,
          });
        }
        return Promise.reject(failErr);
      }
    } else {
      if (!silent) {
        wx.showToast({
          title: '网络异常',
          icon: 'none',
          duration: 2000,
        });
      }
      return Promise.reject('网络异常');
    }
  }).catch(err => {
    if (shouldShowLoading) {
      app.hideLoading();
    }
    console.error(`云函数 ${name} 调用失败:`, err);
    if (!silent) {
      wx.showToast({
        title: '网络异常',
        icon: 'none',
        duration: 2000,
      });
    }
    return Promise.reject(err);
  });
}

/**
 * 获取当前用户信息
 */
function getUserInfo() {
  return app.getUserInfo();
}

/**
 * 获取当前用户角色
 */
function getUserRole() {
  return app.getUserRole();
}

/**
 * 判断是否为老板
 */
function isBoss() {
  return app.isBoss();
}

module.exports = {
  callCloud,
  getUserInfo,
  getUserRole,
  isBoss,
};
