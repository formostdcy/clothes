// pages/finished/outbound/add/index.js
const { callCloud } = require('../../../../utils/request.js');
const { mapAvailableProcessing } = require('../../../../utils/field-map.js');
const pageGuard = require('../../../../utils/page-guard.js');
const app = getApp();

pageGuard({
  moduleKey: 'finished_outbound',
  data: {
    orderList: [],
    destinationList: [],
    selectedOrder: null,
    selectedDestination: null,
    count: '',
    remark: ''
  },

  onLoad() {
    this.loadOrderList();
    this.loadDestinationList();
  },

  onShow() {
    // 从新增目的地页返回时，重新拉一次目的地列表
    this.loadDestinationList();
  },

  loadOrderList() {
    wx.showLoading({ title: '加载中...' });
    callCloud('finished-availableOrderList').then(res => {
      const list = (res || []).map(item => mapAvailableProcessing(item));
      this.setData({ orderList: list });
    }).finally(() => wx.hideLoading());
  },

  loadDestinationList() {
    callCloud('option-list', { type: 'destination' }).then(res => {
      const arr = Array.isArray(res) ? res : (res && res.data) || [];
      this.setData({ destinationList: arr });
    }).catch(() => {});
  },

  onOrderChange(e) {
    const index = e.detail.value;
    const order = this.data.orderList[index];
    this.setData({
      selectedOrder: order,
      // 切换订单时清空出库数量（避免上个订单的数量留到新订单）
      count: '',
    });
  },

  onDestinationChange(e) {
    const index = e.detail.value;
    this.setData({ selectedDestination: this.data.destinationList[index] });
  },

  onCountInput(e) {
    this.setData({ count: e.detail.value });
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value });
  },

  onAddDestination() {
    // 需求 4.4.3: 点击「新增目的地」输入名称
    wx.showModal({
      title: '新增出库目的地',
      content: '请输入新的目的地名称',
      editable: true,
      placeholderText: '例如: 滨江校区 / 萧山仓库',
      success: res => {
        if (res.confirm && res.content && res.content.trim()) {
          const name = res.content.trim();
          // 调云函数写 option 集合
          wx.showLoading({ title: '保存中...' });
          callCloud('option-add', { type: 'destination', name, value: name })
            .then(() => {
              wx.hideLoading();
              wx.showToast({ title: '已添加' });
              // 重新拉列表并自动选上新建的
              this.loadDestinationList();
              // 等列表刷新完后默认选最后一个（即新加的）
              setTimeout(() => {
                const list = this.data.destinationList;
                const idx = list.findIndex(x => (x.name || x.value) === name);
                if (idx >= 0) {
                  this.setData({ selectedDestination: list[idx] });
                } else {
                  // 后端 sort 后位置可能变了
                  this.setData({ selectedDestination: { name, value: name } });
                }
              }, 500);
            })
            .catch(err => {
              wx.hideLoading();
              wx.showToast({ title: '添加失败：' + (err && err.message ? err.message : err), icon: 'none' });
            });
        } else if (res.confirm) {
          wx.showToast({ title: '名称不能为空', icon: 'none' });
        }
      }
    });
  },

  onSubmit() {
    const { selectedOrder, selectedDestination, count, remark } = this.data;
    if (!selectedOrder) {
      wx.showToast({ title: '请选择加工单', icon: 'none' });
      return;
    }
    if (!selectedDestination) {
      wx.showToast({ title: '请选择目的地', icon: 'none' });
      return;
    }
    const countNum = parseInt(count) || 0;
    if (countNum <= 0) {
      wx.showToast({ title: '请输入出库数量', icon: 'none' });
      return;
    }
    if (countNum > (selectedOrder.availableCount || 0)) {
      wx.showToast({ title: '出库数量不能超过当前库存 ' + selectedOrder.availableCount, icon: 'none' });
      return;
    }
    const userInfo = app.getUserInfo() || {};
    wx.showLoading({ title: '提交中...' });
    callCloud('finished-outboundAdd', {
      processing_order_id: selectedOrder.id,
      outbound_details: [{
        gender: selectedOrder.gender || '',
        style: selectedOrder.style || '',
        school: selectedOrder.school || '',
        size: selectedOrder.size || '',
        quantity: countNum
      }],
      destination: selectedDestination.name || selectedDestination.value || '',
      photos: [],
      creator_id: userInfo._id || '',
      remark: remark || ''
    }).then(() => {
      wx.hideLoading();
      wx.showToast({ title: '出库成功' });
      setTimeout(() => wx.navigateBack(), 1500);
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: '出库失败：' + (err && err.message ? err.message : err), icon: 'none' });
    });
  }
});
