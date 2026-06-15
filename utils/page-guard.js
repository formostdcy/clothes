/**
 * 页面级角色权限守卫 Mixin
 *
 * 用法：在 Page 里混入即可
 * ```
 * const pageGuard = require('../../utils/page-guard.js');
 *
 * Page(pageGuard({
 *   moduleKey: 'raw',  // 必填，模块 key
 *   onLoad() { ... }
 * }));
 * ```
 *
 * 行为：
 * - 进入页面时检查当前角色能否访问该模块
 * - 不能则提示 + 跳回首页
 */

const { canAccessModule, isBoss, getModulesByRole } = require('./permissions.js');
const app = getApp();

/**
 * 创建一个模块入口守卫，并自动注册为 Page
 * @param {object} config - Page 配置
 * @param {string} config.moduleKey - 模块 key: raw/cutting/workshop/finished
 * @returns {void}
 */
function guard(config) {
  const moduleKey = config.moduleKey;
  if (!moduleKey) {
    throw new Error('pageGuard 必须传 moduleKey');
  }

  const userOnLoad = config.onLoad;
  const userOnShow = config.onShow;

  // 包装 onLoad，加权限检查
  config.onLoad = function (options) {
    const userInfo = app.getUserInfo() || {};
    const role = userInfo.role || '';

    // 未登录：跳登录
    if (!role) {
      console.warn(`[pageGuard] 模块 ${moduleKey} 拒绝：未登录`);
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }

    // 角色无权访问
    if (!canAccessModule(role, moduleKey)) {
      console.warn(`[pageGuard] 模块 ${moduleKey} 拒绝：角色 ${role}`);
      wx.showModal({
        title: '权限不足',
        content: `您的角色（${role}）无权访问此模块`,
        showCancel: false,
        success: () => {
          wx.reLaunch({ url: '/pages/index/index' });
        },
      });
      return;
    }

    if (typeof userOnLoad === 'function') {
      return userOnLoad.call(this, options);
    }
  };

  // onShow 不做权限拦截（避免正常返回时一直被拦），只透传
  if (userOnShow) {
    config.onShow = userOnShow;
  }

  Page(config);
}

module.exports = guard;
