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
      this.loadUnreadCount();
      this.loadTodoList();
    }
  },

  loadUnreadCount() {
    if (!app.getUserInfo()) return;
    callCloud('notification-unreadCount', {
      user_id: app.getUserInfo()._id,
      role: app.getUserInfo().role,
    }, false).then(data => {
      this.setData({ unreadCount: (data && data.count) || 0 });
    }).catch(() => {});
  },

  loadTodoList() {
    if (!app.getUserInfo()) return;
    callCloud('notification-list', {
      user_id: app.getUserInfo()._id,
      role: app.getUserInfo().role,
      page: 1,
      pageSize: 5,
    }, { silent: true }).then(data => {
      const todoList = (data.list || [])
        .filter(item => !item.is_read)
        .map(item => ({
          ...item,
          timeText: timeAgo(item.created_at),
        }));
      this.setData({ todoList });
    }).catch(() => {});
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
      finished:           '/pages/finished/confirm/list/index',
      boss:               '/pages/boss/overview/index',
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
