// pages/workshop/incoming/list/index.js
const { callCloud } = require('../../../../utils/request.js');
const { mapWorkshopIncoming } = require('../../../../utils/field-map.js');
const { formatDate } = require('../../../../utils/util.js');
const pageGuard = require('../../../../utils/page-guard.js');

pageGuard({
  moduleKey: 'workshop',
  data: {
    activeTab: 0,
    list: [],
    page: 1,
    pageSize: 20,
    total: 0,
    loading: false
  },

  onLoad() {
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

  onTabChange(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ activeTab: index, page: 1, list: [] });
    this.loadList();
  },

  loadList(concat = false) {
    this.setData({ loading: true });
    // activeTab 0=待确认 1=已确认 → 转成 status 文本
    const statusMap = { 0: '待确认', 1: '已确认' };
    const status = statusMap[this.data.activeTab] || '';
    return callCloud('workshop-incomingList', {
      status,
      page: this.data.page,
      pageSize: this.data.pageSize
    }).then(res => {
      const list = (res.list || []).map(item => {
        const mapped = mapWorkshopIncoming(item);
        mapped.createTime = formatDate(mapped.createTime, 'MM-DD HH:mm');
        return mapped;
      });
      const newList = concat ? [...this.data.list, ...list] : list;
      this.setData({ list: newList, total: res.total || 0, loading: false });
    }).catch(() => {
      this.setData({ loading: false });
    });
  },

  onConfirm(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认来料',
      content: '确认该来料数量和质量无误？',
      success: res => {
        if (res.confirm) {
          // 修：后端失败时也要刷新列表（之前只有 then 没 catch，失败后状态未刷新）
          callCloud('workshop-incomingConfirm', { _id: id }).then(() => {
            wx.showToast({ title: '确认成功' });
            this.setData({ page: 1, list: [] });
            this.loadList();
          }).catch(err => {
            console.error('[onConfirm] 失败:', err);
            // 即便失败也刷新一次列表（如果状态被部分更新，避免界面与数据不同步）
            this.setData({ page: 1, list: [] });
            this.loadList();
          });
        }
      }
    });
  },

  onProblem(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '反馈问题',
      content: '确认该来料有问题？',
      success: res => {
        if (res.confirm) {
          // 修：同样加 catch
          callCloud('workshop-incomingProblem', { _id: id, problem_desc: '来料有问题，请查看' }).then(() => {
            wx.showToast({ title: '已反馈' });
            this.setData({ page: 1, list: [] });
            this.loadList();
          }).catch(err => {
            console.error('[onProblem] 失败:', err);
            this.setData({ page: 1, list: [] });
            this.loadList();
          });
        }
      }
    });
  },

  onPreviewPhoto(e) {
    const { urls, current } = e.currentTarget.dataset;
    wx.previewImage({ urls, current });
  }
});
