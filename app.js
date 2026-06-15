// app.js
const DEFAULT_CONFIG = {
  cloudEnv: 'cloud1-d1gyhaxtu1321e4be', // 微信云开发环境ID
};

App({
  globalData: {
    userInfo: null,
    openid: '',
    config: DEFAULT_CONFIG,
  },

  onLaunch() {
    // 初始化云开发
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: 'cloud1-d1gyhaxtu1321e4be', // 微信云开发环境ID
        traceUser: true,
      });
    }

    // 检查登录态
    this.checkLoginStatus();
  },

  checkLoginStatus() {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      this.globalData.userInfo = userInfo;
    }
  },

  /**
   * 获取当前用户信息
   */
  getUserInfo() {
    return this.globalData.userInfo;
  },

  /**
   * 设置当前用户信息
   */
  setUserInfo(userInfo) {
    this.globalData.userInfo = userInfo;
    wx.setStorageSync('userInfo', userInfo);
  },

  /**
   * 清除登录信息（退出登录）
   */
  clearUserInfo() {
    this.globalData.userInfo = null;
    wx.removeStorageSync('userInfo');
  },

  /**
   * 获取当前用户角色
   */
  getUserRole() {
    const userInfo = this.getUserInfo();
    return userInfo ? userInfo.role : '';
  },

  /**
   * 判断是否为老板角色
   */
  isBoss() {
    return this.getUserRole() === '老板';
  },

  /**
   * 统一云函数调用封装
   * @param {string} name 云函数名称
   * @param {object} data 传入参数
   * @returns {Promise}
   */
  callFunction(name, data = {}) {
    return wx.cloud.callFunction({
      name,
      data,
    }).then(res => {
      if (res.result && res.result.success) {
        return res.result;
      } else {
        return Promise.reject(res.result && res.result.error || '请求失败');
      }
    }).catch(err => {
      console.error(`云函数 ${name} 调用失败:`, err);
      return Promise.reject(err);
    });
  },

  /**
   * 显示加载中提示
   */
  showLoading(title = '加载中') {
    if (wx.showLoading) {
      wx.showLoading({ title, mask: true });
    }
  },

  /**
   * 隐藏加载提示
   */
  hideLoading() {
    if (wx.hideLoading) {
      wx.hideLoading();
    }
  },

  /**
   * 显示成功提示
   */
  showSuccess(title = '操作成功') {
    wx.showToast({ title, icon: 'success', duration: 2000 });
  },

  /**
   * 显示错误提示
   */
  showError(title = '操作失败') {
    wx.showToast({ title, icon: 'none', duration: 2000 });
  },
});
