import {json} from "../_utils.js";
import {fulfillOrder,releaseReservation} from "../_delivery.js";
async function verify(raw, signature, secret) {
  if(!signature || !secret) return false;
  const parts=Object.fromEntries(signature.split(",").map(x=>x.trim().split("=")));
  const ts=Number(parts.t), supplied=parts.v1||"";
  if(!Number.isFinite(ts) || Math.abs(Date.now()/1000-ts)>300 || !/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const mac=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(`${ts}.${raw}`));
  const expected=[...new Uint8Array(mac)].map(x=>x.toString(16).padStart(2,"0")).join("");
  let diff=0; for(let i=0;i<64;i++) diff|=expected.charCodeAt(i)^supplied.toLowerCase().charCodeAt(i);
  return diff===0;
}
export async function onRequestPost({request,env}) {
  const raw=await request.text();
  if(!await verify(raw,request.headers.get("X-APIQris-Signature"),env.APIQRIS_WEBHOOK_SECRET)) return json({error:"Invalid signature"},401);
  let event; try {event=JSON.parse(raw)} catch {return json({error:"Invalid JSON"},400)}
  if(event.event==="ping") return json({ok:true});
  const orderId=String(event.order_id||""); if(!orderId) return json({error:"Missing order_id"},400);
  const order=await env.DB.prepare("SELECT * FROM orders WHERE id=?").bind(orderId).first();
  if(!order) return json({error:"Order not found"},404);
  if(event.event==="invoice.paid" && event.status==="paid") {
    if(order.status==="pending") {
      await env.DB.prepare("UPDATE orders SET status='paid',paid_at=?,total_amount=?,updated_at=datetime('now') WHERE id=? AND status='pending'")
        .bind(event.paid_at||new Date().toISOString(),Number(event.total_amount||order.amount),orderId).run();
    }
    // Retry-safe: repeated valid paid webhooks can complete a previously partial delivery.
    await fulfillOrder(env, orderId);
  } else if(["invoice.expired","invoice.cancelled"].includes(event.event) && order.status==="pending") {
    await env.DB.prepare("UPDATE orders SET status=?,delivery_status='cancelled',updated_at=datetime('now') WHERE id=? AND status='pending'").bind(event.event==="invoice.expired"?"expired":"cancelled",orderId).run();
    await releaseReservation(env,orderId);
  }
  return json({ok:true});
}
