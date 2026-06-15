/**
 * 通用工具函数
 */

/**
 * 生成订单编号
 * @param {string} prefix - 前缀，如 RK、CK、CJ 等
 */
function generateOrderNo(prefix = 'NO') {
  const now = new Date();
  const Y = now.getFullYear();
  const M = String(now.getMonth() + 1).padStart(2, '0');
  const D = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `${prefix}-${Y}${M}${D}-${h}${m}${s}${rand}`;
}

/**
 * 格式化日期
 * @param {Date|string|number} date
 * @param {string} format
 */
function formatDate(date, format = 'YYYY-MM-DD HH:mm:ss') {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hour = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');
  const second = String(d.getSeconds()).padStart(2, '0');
  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hour)
    .replace('mm', minute)
    .replace('ss', second);
}

/**
 * 相对时间描述
 * @param {Date|string|number} date
 */
function timeAgo(date) {
  if (!date) return '';
  const now = Date.now();
  const t = date instanceof Date ? date.getTime() : new Date(date).getTime();
  const diff = now - t;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)}分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)}小时前`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}天前`;
  return formatDate(date, 'MM-DD HH:mm');
}

/**
 * 校验非空
 * @param {any} value
 */
function isEmpty(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * 校验手机号
 * - 11 位手机号：1[3-9]xxxxxxxxx
 * - 座机：区号(3-4位) - 主号(7-8位)，如 0755-12345678 / 010-12345678
 * - 400/800 服务号
 */
function isValidPhone(phone) {
  if (!phone) return false;
  const trimmed = String(phone).trim();
  // 手机号
  if (/^1[3-9]\d{9}$/.test(trimmed)) return true;
  // 座机：0xx-xxxxxxx / 0xx-xxxxxxxx / (0xx) xxxxxxxx
  if (/^0\d{2,3}-?\d{7,8}$/.test(trimmed)) return true;
  // 400 / 800 服务号
  if (/^400-?\d{3}-?\d{4}$/.test(trimmed)) return true;
  if (/^800-?\d{3}-?\d{4}$/.test(trimmed)) return true;
  return false;
}

/**
 * 防抖函数
 */
function debounce(fn, delay = 500) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * 节流函数
 */
function throttle(fn, delay = 500) {
  let last = 0;
  return function (...args) {
    const now = Date.now();
    if (now - last > delay) {
      last = now;
      fn.apply(this, args);
    }
  };
}

/**
 * 深拷贝
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(item => deepClone(item));
  const copy = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      copy[key] = deepClone(obj[key]);
    }
  }
  return copy;
}

/**
 * 状态映射中文
 */
const STATUS_TEXT = {
  // 原材料订单
  '已完成': '已完成',
  '已取消': '已取消',
  '待确认': '待确认',
  '有问题': '有问题',
  '已确认': '已确认',
  '已退回': '已退回',
};

/**
 * 获取状态对应样式
 */
function getStatusStyle(status) {
  const map = {
    '待确认': 'badge-warning',
    '已完成': 'badge-success',
    '已取消': 'badge-grey',
    '已确认': 'badge-success',
    '有问题': 'badge-danger',
    '已退回': 'badge-danger',
  };
  return map[status] || 'badge-grey';
}

/**
 * 获取状态文字
 */
function getStatusText(status) {
  return STATUS_TEXT[status] || status;
}

/**
 * 角色映射
 */
const ROLE_TEXT = {
  '原材料管理员': '原材料',
  '裁剪管理员': '裁剪',
  '车间管理员': '车间',
  '成品管理员': '成品',
  '老板': '老板',
};

/**
 * 获取角色简称
 */
function getRoleShort(role) {
  return ROLE_TEXT[role] || role;
}

module.exports = {
  generateOrderNo,
  formatDate,
  timeAgo,
  isEmpty,
  isValidPhone,
  debounce,
  throttle,
  deepClone,
  getStatusStyle,
  getStatusText,
  getRoleShort,
};
