// pages/boss/orders/detail/index.js
const { callCloud } = require('../../../../utils/request.js');
const { mapOrderDetail } = require('../../../../utils/field-map.js');
const { formatDate } = require('../../../../utils/util.js');
const pageGuard = require('../../../../utils/page-guard.js');

pageGuard({
  moduleKey: 'boss',
  data: {
    id: '',
    orderNo: '',
    materialName: '',
    planCount: 0,
    createTime: '',
    statusText: '',
    items: []
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ id: options.id });
      this.loadDetail();
    }
  },

  loadDetail() {
    callCloud('order-detail', { id: this.data.id }).then(res => {
      const mapped = mapOrderDetail(res) || {};
      mapped.createTime = formatDate(mapped.createTime, 'YYYY-MM-DD HH:mm');
      this.setData({
        orderNo: mapped.orderNo || '',
        materialName: mapped.materialName || '',
        planCount: mapped.planCount || 0,
        createTime: mapped.createTime || '',
        statusText: mapped.statusText || '',
        items: mapped.items || []
      });
    });
  }
});
