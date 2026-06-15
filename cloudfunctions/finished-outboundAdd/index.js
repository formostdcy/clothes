const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 闂佺懓鐡ㄩ崝鏇㈠箹閿焋 - 闂佸搫鍊瑰姗€路閸愵喖绀勯柛婵嗗濮榒
 */

function generateOrderNo() {
  // 关键：云函数在云端运行，默认是 UTC 时间，需要 +8 小时偏移得到北京时间
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `CC-${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}${rand}`;
}

exports.main = async (event, context) => {
  const db = cloud.database();
  const { processing_order_id, outbound_details, destination, photos, creator_id } = event;

  if (!processing_order_id) return { success: false, error: '闂佸憡姊绘慨瀛樺閹版澘纭€闁哄洦姘ㄩ悷婵嬫煠閾忣偄鐏婇悹鎰枔缁甡'};
  if (!outbound_details || outbound_details.length === 0) {
    return { success: false, error: '闂佸憡鍨甸幖顐よ姳闁秴鍙婇幖杈剧悼閻骸鈽夐幘宕囆ラ柛蹇斏戠粙澶愭惞閸忓鏅`' };
  }
  if (!destination) return { success: false, error: '闂佺儵鏅╅崰姘枔閹达箑鎹跺Λ棰佽兌閻熸繈鏌ら搹顐㈢亰閻犳劗鍠撶划`'};

  try {
    await db.runTransaction(async (transaction) => {
      // 闁圭厧鐡ㄩ幐鎼佹偤閵娾晛绠ラ柨婵嗘噹濞卄
      for (const item of outbound_details) {
        const { gender, style, school, size, quantity } = item;
        if (!quantity || quantity <= 0) continue;

        const stockRes = await transaction.collection('finished_product_stock') .where({ gender, style, school, size })
          .limit(1)
          .get();

        if (stockRes.data.length === 0 || stockRes.data[0].quantity < quantity) {
          throw new Error(`SKU[${gender}-${style}-${school}-${size}]闁圭厧鐡ㄩ幐鎼佹偤閵婏妇鈻旂€广儱鐗嗛崰鏄`);
        }

        await transaction.collection('finished_product_stock') .doc(stockRes.data[0]._id)
          .update({
            data: {
              quantity: db.command.inc(-quantity),
              updated_at: db.serverDate(),
            },
          });
      }

      // 闂佸憡甯楃粙鎴犵磽閹捐绀勯柛婵嗗濮樸劑鏌涢敓'
      await transaction.collection('finished_outbound_order').add({
        data: {
          order_no: generateOrderNo(),
          processing_order_id,
          outbound_details,
          destination,
          photos: photos || [],
          creator_id: creator_id || '',
          status: '已出库',
          created_at: db.serverDate(),
        },
      });
    });

    return { success: true };
  } catch (e) {
    console.error('闂佸搫鍊瑰姗€路閸愵喖绀勯柛婵嗗濮樸劌顭块幆鎵翱閻熸瑱鎷`:', e);
    return { success: false, error: e.message || '闂佺懓鐏濈粔宕囩礊閺冣偓瀵板嫭娼忛銉恅' };
  }
};
