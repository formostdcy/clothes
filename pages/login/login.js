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

    // 关键修复：30 秒超时机制。体验版经常因为云函数没部署而无限转圈，
    // 这里强制到时间就中断 + 给出明确诊断。
    let timeoutId = null;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        const err = new Error('云函数 auth-login 30 秒内无响应');
        err.code = 'TIMEOUT';
        err.diagnosis = [
          '可能原因 1：auth-login 云函数没部署到生产环境',
          '  → 去云开发控制台 → 云函数 → 确认 auth-login 在列表里',
          '可能原因 2：app.js 里的 cloudEnv ID 和你部署的环境不一致',
          '  → 当前: cloud1-d1gyhaxtu1321e4be',
          '可能原因 3：cloud.init 没成功执行（基础库版本太低，要求 ≥ 2.2.3）',
          '  → 微信开发者工具 → 详情 → 本地设置 → 调试基础库',
        ].join('\n');
        reject(err);
      }, 30000);
    });

    Promise.race([
      callCloud('auth-login', { account, password }, false),
      timeoutPromise,
    ])
      .then(data => {
        clearTimeout(timeoutId);
        console.log('[login] auth-login success, data=', data);
        app.setUserInfo(data);
        this.setData({ loading: false });
        this.redirectByRole(data.role);
      })
      .catch(err => {
        clearTimeout(timeoutId);
        console.error('[login] auth-login failed, err=', err);
        this.setData({ loading: false });

        let title = '登录失败';
        if (err && err.code === 'TIMEOUT') {
          title = '云函数无响应(30s)';
          // 同时在控制台打出详细诊断
          console.error('[login] 诊断信息:\n' + (err.diagnosis || ''));
        } else if (err && err.message) {
          title = '登录失败: ' + err.message.slice(0, 20);
        } else if (typeof err === 'string') {
          title = '登录失败: ' + err.slice(0, 20);
        }

        wx.showModal({
          title: title,
          content: err && err.diagnosis
            ? err.diagnosis + '\n\n(完整诊断已打印到控制台)'
            : (err && err.message) || String(err),
          showCancel: err && err.code === 'TIMEOUT',
          cancelText: '复制诊断',
          confirmText: '我知道了',
          success: (res) => {
            if (res.cancel && err && err.diagnosis) {
              wx.setClipboardData({
                data: err.diagnosis,
                success: () => wx.showToast({ title: '诊断已复制', icon: 'success' }),
              });
            }
          },
        });
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
