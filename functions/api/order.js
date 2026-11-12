import {json,fail} from "./_utils.js";
export async function onRequestGet({request,env}) {
  const id=new URL(request.url).searchParams.get("id");
  if(!id || !/^WHID[A-Z0-9]+$/.test(id)) return fail("ID pesanan tidak valid.");
  const o=await env.DB.prepare("SELECT id,customer_name,product_name,quantity,amount,total_amount,status,qr_image_url,expires_at,paid_at,created_at,delivery_status FROM orders WHERE id=?").bind(id).first();
  if(!o) return fail("Pesanan tidak ditemukan.",404);
  let deliveries=[];
  if(o.status==="paid") {
    const rows=await env.DB.prepare("SELECT payload,delivered_at FROM delivery_items WHERE order_id=? AND status='delivered' ORDER BY delivered_at,id").bind(id).all();
    deliveries=rows.results||[];
  }
  return json({order:o,deliveries});
}
