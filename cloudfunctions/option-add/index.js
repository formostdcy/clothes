const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 缁崵绮洪柅澶愩€� - 閺傛澘顤�
 */

exports.main = async (event, context) => {
  const db = cloud.database();
  const { type, name, creator_id } = event;

  if (!type || !name) return { success: false, error: '缁鐎烽崪灞芥倳缁夐绗夐懗鎴掕礋缁�'};

  const validTypes = ['school', 'category_two', 'size', 'style', 'workshop', 'destination', 'gender', 'season'];
  if (!validTypes.includes(type)) return { success: false, error: '缁鐎锋稉宥呮値濞�'};

  try {
    // 濡偓閺屻儲妲搁崥锕€鍑＄€涙ê婀崥灞芥倳闁銆�
    const existRes = await db.collection('system_option') .where({ type, name: name.trim() })
      .count();
    if (existRes.total > 0) {
      return { success: false, error: '鐠囥儵鈧銆嶅鎻掔摠閸�'};
    }

    const res = await db.collection('system_option').add({
      data: {
        type,
        name: name.trim(),
        creator_id: creator_id || '',
        created_at: db.serverDate(),
      },
    });
    return { success: true, data: { _id: res._id } };
  } catch (e) {
    console.error('閺傛澘顤冮柅澶愩€嶆径杈Е:', e);
    return { success: false, error: '閺傛澘顤冩径杈Е' };
  }
};
