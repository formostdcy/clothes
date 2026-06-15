// pages/login/login.js
const app = getApp();
const { callCloud } = require('../../utils/request.js');

Page({
  data: {
    account: '',
    password: '',
    loading: false,
    cachedAccount: '',
  },

  onLoad() {
    // 检查是否已登录（缓存里有 userInfo）
    const userInfo = app.getUserInfo();
    if (userInfo) {
      // 弹窗让用户选择：继续用旧账号 / 切换账号
      this.setData({ cachedAccount: userInfo.account || '' });
    }
  },

  /**
   * 用已缓存的账号继续登录
   */
  onUseCached() {
    const userInfo = app.getUserInfo();
    if (userInfo) this.redirectByRole(userInfo.role);
  },

  /**
   * 清除缓存，输入新账号登录
   */
  onSwitchAccount() {
    app.clearUserInfo();
    this.setData({ cachedAccount: '' });
  },

  onAccountInput(e) {
    this.setData({ account: e.detail.value });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value });
  },

  onLogin() {
    const { account, password } = this.data;

    console.log('[login] onLogin start, account=', account);

    if (!account) {
      wx.showToast({ title: '请输入账号', icon: 'none' });
      return;
    }
    if (!password) {
      wx.showToast({ title: '请输入密码', icon: 'none' });
      return;
    }

    this.setData({ loading: true });

    console.log('[login] calling auth-login...');
    callCloud('auth-login', { account, password }, false)
      .then(data => {
        console.log('[login] auth-login success, data=', data);
        app.setUserInfo(data);
        this.setData({ loading: false });
        this.redirectByRole(data.role);
      })
      .catch(err => {
        console.error('[login] auth-login failed, err=', err);
        this.setData({ loading: false });
        wx.showToast({ title: '登录失败:' + (err && err.message ? err.message : err), icon: 'none', duration: 3000 });
      });
  },

  redirectByRole(role) {
    if (!role) {
      wx.showToast({ title: '角色异常', icon: 'none' });
      return;
    }

    // 老板跳转到老板首页，其他跳转到通用首页
    if (role === '老板') {
      console.log('[login] redirect to boss overview');
      wx.redirectTo({ url: '/pages/boss/overview/index' });
    } else {
      console.log('[login] switchTab to /pages/index/index');
      wx.switchTab({ url: '/pages/index/index' });
    }
  },
});
