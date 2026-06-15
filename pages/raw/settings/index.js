// pages/raw/settings/index.js
const pageGuard = require('../../../utils/page-guard.js');
const { isBoss } = require('../../../utils/permissions.js');
const app = getApp();

pageGuard({
  moduleKey: 'raw',
  data: {
    isBoss: false,
  },
  onLoad() {
    const role = (app.getUserInfo() || {}).role || '';
    this.setData({ isBoss: isBoss(role) });
  },
  goToSupplier() {
    wx.navigateTo({ url: '/pages/raw/settings/supplier/index' });
  },
  goToOption() {
    wx.navigateTo({ url: '/pages/raw/settings/option/index' });
  },
});
