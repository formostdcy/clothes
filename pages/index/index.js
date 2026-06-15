// pages/index/index.js
const app = getApp();
const { callCloud } = require('../../utils/request.js');
const { timeAgo } = require('../../utils/util.js');
const { getModulesByRole, getExtraModulesByRole, isBoss } = require('../../utils/permissions.js');

Page({
  data: {
    userInfo: {},
    moduleList: [],   // 主模块
    extraModuleList: [], // 扩展模块
    todoList: [],
    unreadCount: 0,
    isBoss: false,
  },

  onShow() {
    const userInfo = app.getUserInfo() || {};
    const role = userInfo.role || '';
    const moduleList = getModulesByRole(role);
    const extraModuleList = getExtraModulesByRole(role);

    this.setData({
      userInfo,
      moduleList,
      extraModuleList,
      isBoss: isBoss(role),
    });

    if (userInfo && userInfo._id) {
      // 关键优化：用 1 次 notification-overview 调用拿回 unreadCount + todoList
      // （之前是 2 次独立调用 = 2 次网络往返，登录后首页可见性延迟 2-3 秒）
      this.loadNotificationOverview();
    }
  },

  loadNotificationOverview() {
    if (!app.getUserInfo()) return;
    const userInfo = app.getUserInfo();
    callCloud('notification-overview', {
      user_id: userInfo._id,
      role: userInfo.role,
      page: 1,
      pageSize: 5,
    }, { silent: true }).then(data => {
      if (!data) return;
      const list = data.todoList || [];
      this.setData({
        unreadCount: data.unreadCount || 0,
        todoList: list.map(item => ({
          ...item,
          timeText: timeAgo(item.created_at),
        })),
      });
    }).catch(err => {
      console.warn('[首页] 通知概览加载失败:', err);
      // 静默失败，不影响首页主功能
    });
  },

  goToModule(e) {
    const moduleKey = e.currentTarget.dataset.module;
    const userInfo = app.getUserInfo() || {};
    const role = userInfo.role || '';

    const { canAccessModule } = require('../../utils/permissions.js');
    if (!canAccessModule(role, moduleKey)) {
      wx.showToast({ title: '无权访问该模块', icon: 'none' });
      return;
    }

    const routes = {
      raw:                '/pages/raw/list/index',
      cutting:            '/pages/cutting/incoming/list/index',
      cutting_add:        '/pages/cutting/cutting/add/index',
      cutting_record:     '/pages/cutting/record/index',
      workshop:           '/pages/workshop/incoming/list/index',
      workshop_pending:   '/pages/workshop/pending/list/index',
      workshop_processing:'/pages/workshop/processing/add/index',
      workshop_record:    '/pages/workshop/record/index',
      finished_inbound:  '/pages/finished/confirm/list/index',
      finished_stock:    '/pages/finished/stock/index',
      finished_outbound: '/pages/finished/outbound/add/index',
      finished_record:   '/pages/finished/outbound/record/index',
      finished:          '/pages/finished/confirm/list/index',
      boss:              '/pages/boss/overview/index',
    };

    if (routes[moduleKey]) {
      wx.navigateTo({ url: routes[moduleKey] });
    }
  },

  goToNotification() {
    wx.switchTab({ url: '/pages/notification/list/index' });
  },

  goToEmployee() { wx.navigateTo({ url: '/pages/boss/employee/list/index' }); },
  goToOrders()    { wx.navigateTo({ url: '/pages/boss/orders/index' }); },
  goToStats()     { wx.navigateTo({ url: '/pages/boss/finished-stats/index' }); },
  goToSettings()  { wx.navigateTo({ url: '/pages/boss/settings/index' }); },

  goToTodo(e) {
    const item = e.currentTarget.dataset.item;
    if (item._id) {
      callCloud('notification-markRead', { _id: item._id }).then(() => {
        this.loadTodoList();
      });
    }
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出登录吗？',
      confirmText: '退出',
      cancelText: '取消',
      confirmColor: '#FF4D4F',
      success: res => {
        if (res.confirm) {
          app.clearUserInfo();
          wx.reLaunch({ url: '/pages/login/login' });
        }
      },
    });
  },
});
