const pageGuard = require('../../../utils/page-guard.js');

pageGuard({
  moduleKey: 'boss',
  goToEmployee() {
    wx.navigateTo({ url: '/pages/boss/employee/list/index' });
  },

  goToOption() {
    wx.navigateTo({ url: '/pages/boss/settings/option-edit/index' });
  },

  goToSupplier() {
    wx.navigateTo({ url: '/pages/boss/settings/supplier/index' });
  },

  goToStockInit() {
    wx.navigateTo({ url: '/pages/boss/settings/stock-init/index' });
  },

  goToDataExport() {
    wx.navigateTo({ url: '/pages/boss/settings/data-export/index' });
  }
});
