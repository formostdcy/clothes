// pages/finished/outbound/record/index.js
const { callCloud } = require('../../../../utils/request.js');
const { mapFinishedOutbound } = require('../../../../utils/field-map.js');
const { formatDate } = require('../../../../utils/util.js');
const pageGuard = require('../../../../utils/page-guard.js');

pageGuard({
  moduleKey: 'finished',
  data: {
    list: [],
    destinationList: [],
    selectedDestination: null,
    startDate: '',
    endDate: '',
    page: 1,
    pageSize: 20,
    total: 0,
    loading: false
  },

  onLoad() {
    this.loadDestinations();
    this.loadList();
  },

  onReachBottom() {
    if (this.data.loading) return;
    if (this.data.list.length >= (this.data.total || 0)) return;
    this.setData({ page: this.data.page + 1 });
    this.loadList(true);
  },

  onPullDownRefresh() {
    this.setData({ page: 1, list: [] });
    this.loadList().finally(() => wx.stopPullDownRefresh());
  },

  loadDestinations() {
    callCloud('option-list', { type: 'destination' }).then(res => {
      const arr = Array.isArray(res) ? res : (res && res.data) || [];
      this.setData({ destinationList: arr });
    }).catch(() => {});
  },

  loadList(concat = false) {
    const { selectedDestination, startDate, endDate } = this.data;
    const params = {
      page: this.data.page,
      pageSize: this.data.pageSize
    };
    if (selectedDestination) params.destination = selectedDestination.name || selectedDestination.value || '';
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;

    this.setData({ loading: true });
    return callCloud('finished-outboundList', params).then(res => {
      const list = (res.list || []).map(item => {
        const mapped = mapFinishedOutbound(item);
        mapped.outboundTime = formatDate(mapped.outboundTime, 'YYYY-MM-DD HH:mm');
        return mapped;
      });
      const newList = concat ? [...this.data.list, ...list] : list;
      this.setData({ list: newList, total: res.total || 0, loading: false });
    }).catch(() => {
      this.setData({ loading: false });
    });
  },

  onDestinationChange(e) {
    const index = e.detail.value;
    this.setData({
      selectedDestination: this.data.destinationList[index],
      page: 1, list: []
    });
    this.loadList();
  },

  onStartDateChange(e) {
    this.setData({ startDate: e.detail.value, page: 1, list: [] });
    this.loadList();
  },

  onEndDateChange(e) {
    this.setData({ endDate: e.detail.value, page: 1, list: [] });
    this.loadList();
  },

  onReset() {
    this.setData({
      selectedDestination: null,
      startDate: '',
      endDate: '',
      page: 1,
      list: []
    });
    this.loadList();
  },

  onDetail(e) {
    // 需求 4.4.4: 点击可查看详情（含原始加工单信息）
    const id = e.currentTarget.dataset.id;
    wx.showLoading({ title: '加载详情...' });
    callCloud('finished-outboundDetail', { _id: id })
      .then(detail => {
        wx.hideLoading();
        const lines = [
          `订单编号: ${detail.order_no || '—'}`,
          `目的地: ${detail.destination || '—'}`,
          `出库时间: ${formatDate(detail.created_at, 'YYYY-MM-DD HH:mm')}`,
          `状态: ${detail.status || '—'}`,
          `出库明细:`,
        ];
        (detail.outbound_details || []).forEach((d, i) => {
          lines.push(`  ${i + 1}. ${d.gender || ''} ${d.style || ''} ${d.school || ''} ${d.size || ''} × ${d.quantity || 0}`);
        });
        if (detail.remark) lines.push(`备注: ${detail.remark}`);
        if (detail.processing_order_id) lines.push(`加工单ID: ${detail.processing_order_id}`);
        wx.showModal({
          title: '出库详情',
          content: lines.join('\n'),
          showCancel: false,
          confirmText: '关闭'
        });
      })
      .catch(err => {
        wx.hideLoading();
        wx.showToast({ title: '加载失败：' + (err && err.message ? err.message : err), icon: 'none' });
      });
  }
});
