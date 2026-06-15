// components/finished-tabs/index.js
// 成品模块 4 个子页面统一导航条
// 通过 navigateTo 跳到对应页面（成品页面是独立页面，不在 tabBar 里）
const ROUTES = {
  confirm: '/pages/finished/confirm/list/index',
  stock:   '/pages/finished/stock/index',
  outbound:'/pages/finished/outbound/add/index',
  record:  '/pages/finished/outbound/record/index',
};

Component({
  properties: {
    active: {
      type: String,
      value: '', // 当前激活的 key，父组件传入
    },
  },
  methods: {
    onTap(e) {
      const key = e.currentTarget.dataset.key;
      if (key === this.data.active) return; // 已在当前页
      const url = ROUTES[key];
      if (!url) return;
      // 防止重复点击
      if (this._tapping) return;
      this._tapping = true;
      setTimeout(() => { this._tapping = false; }, 500);

      // 用 redirectTo 避免回退栈混乱
      wx.redirectTo({ url });
    },

    onBack() {
      wx.reLaunch({ url: '/pages/index/index' });
    },
  },
});
