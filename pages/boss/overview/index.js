// pages/boss/overview/index.js
const app = getApp();
const { callCloud } = require('../../../utils/request.js');
const { formatDate } = require('../../../utils/util.js');
const pageGuard = require('../../../utils/page-guard.js');

pageGuard({
  moduleKey: 'boss',
  data: {
    today: '',
    data: {
      todayInboundCount: 0,
      todayOutboundCount: 0,
      cuttingPendingCount: 0,
      workshopPendingCount: 0,
      finishedPendingCount: 0,
      rawTotal: 0,
      finishedTotal: 0,
      monthOutboundTotal: 0,
    },
  },

  onShow() {
    this.setData({ today: formatDate(new Date(), 'YYYY年MM月DD日') });
    this.loadData();
  },

  onPullDownRefresh() {
    this.loadData().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  loadData() {
    return callCloud('boss-overview').then(data => {
      this.setData({ data });
    }).catch(() => {});
  },

  goToModule(e) {
    const module = e.currentTarget.dataset.module;
    const routes = {
      cutting: '/pages/cutting/incoming/list/index',
      workshop: '/pages/workshop/pending/list/index',
      finished: '/pages/finished/confirm/list/index',
    };
    if (routes[module]) {
      wx.navigateTo({ url: routes[module] });
    }
  },

  goToOrders() {
    wx.navigateTo({ url: '/pages/boss/orders/index' });
  },

  goToStats() {
    wx.navigateTo({ url: '/pages/boss/finished-stats/index' });
  },

  goToSettings() {
    wx.navigateTo({ url: '/pages/boss/settings/index' });
  },

  goToEmployee() {
    wx.navigateTo({ url: '/pages/boss/employee/list/index' });
  },

  goToNotification() {
    wx.navigateTo({ url: '/pages/notification/list/index' });
  },

  onLogout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: res => {
        if (res.confirm) {
          app.clearUserInfo();
          wx.redirectTo({ url: '/pages/login/login' });
        }
      },
    });
  },
});
