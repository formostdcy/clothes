// pages/raw/list/index.js
const { callCloud } = require('../../../utils/request.js');
const { formatDate, timeAgo, getStatusStyle } = require('../../../utils/util.js');
const { isBoss, isRawAdmin } = require('../../../utils/permissions.js');
const pageGuard = require('../../../utils/page-guard.js');
const app = getApp();

pageGuard({
  moduleKey: 'raw',
  data: {
    tabIndex: 0,
    inboundList: [],
    outboundList: [],
    stockList: [],
    canManageSettings: false,  // 老板/原材料管理员能进设置
    loading: false
  },

  onLoad() {
    const role = (app.getUserInfo() || {}).role || '';
    const _isBoss = (typeof isBoss === 'function') ? isBoss(role) : (role === '老板');
    const _isRaw = (typeof isRawAdmin === 'function') ? isRawAdmin(role) : (role === '原材料管理员');
    this.setData({ canManageSettings: _isBoss || _isRaw });
    this.loadInboundList();
  },

  onShow() {
    if (this.data.tabIndex === 0) this.loadInboundList();
    else if (this.data.tabIndex === 1) this.loadOutboundList();
    else this.loadStockList();
  },

  switchTab(e) {
    const index = parseInt(e.currentTarget.dataset.index);
    this.setData({ tabIndex: index });
    if (index === 0) this.loadInboundList();
    else if (index === 1) this.loadOutboundList();
    else this.loadStockList();
  },

  loadInboundList() {
    this.setData({ loading: true });
    callCloud('raw-inboundList').then(data => {
      const list = (data.list || []).map(item => ({
        ...item,
        created_at: formatDate(item.created_at, 'MM-DD HH:mm'),
        statusClass: getStatusStyle(item.status),
      }));
      this.setData({ inboundList: list, loading: false });
    }).catch(() => this.setData({ loading: false }));
  },

  loadOutboundList() {
    this.setData({ loading: true });
    callCloud('raw-outboundList').then(data => {
      const list = (data.list || []).map(item => ({
        ...item,
        created_at: formatDate(item.created_at, 'MM-DD HH:mm'),
        statusClass: getStatusStyle(item.status),
      }));
      this.setData({ outboundList: list, loading: false });
    }).catch(() => this.setData({ loading: false }));
  },

  loadStockList() {
    this.setData({ loading: true });
    callCloud('raw-stockList').then(data => {
      this.setData({ stockList: data.list || [], loading: false });
    }).catch(() => this.setData({ loading: false }));
  },

  goToInbound() {
    wx.navigateTo({ url: '/pages/raw/inbound/add/index' });
  },

  goToOutbound() {
    wx.navigateTo({ url: '/pages/raw/outbound/add/index' });
  },

  goToSettings() {
    wx.navigateTo({ url: '/pages/raw/settings/index' });
  },

  onCancelInbound(e) {
    const { id } = e.currentTarget.dataset;
    const userInfo = app.getUserInfo() || {};
    wx.showModal({
      title: '确认取消',
      content: '确定取消该入库单吗？库存将回滚。',
      success: res => {
        if (res.confirm) {
          callCloud('raw-inboundCancel', { _id: id, user_id: userInfo._id || '', user_role: userInfo.role || '' }).then(() => {
            wx.showToast({ title: '已取消', icon: 'success' });
            this.loadInboundList();
          });
        }
      },
    });
  },

  onCancelOutbound(e) {
    const { id } = e.currentTarget.dataset;
    wx.showModal({
      title: '确认取消',
      content: '确定取消该出库单吗？库存将回滚。',
      success: res => {
        if (res.confirm) {
          callCloud('raw-outboundCancel', { _id: id }).then(() => {
            wx.showToast({ title: '已取消', icon: 'success' });
            this.loadOutboundList();
          });
        }
      },
    });
  },
});