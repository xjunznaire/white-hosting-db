import {json,fail,id,body} from "./_utils.js";
import {reserveOrder,releaseReservation} from "./_delivery.js";
export async function onRequestPost({request,env}) {
  if(!env.APIQRIS_KEY) return fail("Pembayaran belum dikonfigurasi oleh admin.",503);
  const d=await body(request); if(!d) return fail("Data checkout tidak valid.");
  const productId=String(d.product_id||""), qty=Number(d.quantity);
  const name=String(d.customer_name||"").trim(), email=String(d.customer_email||"").trim(), contact=String(d.customer_contact||"").trim();
  if(name.length<2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !Number.isInteger(qty) || qty<1 || qty>20) return fail("Lengkapi nama, email, dan jumlah (1–20).");
  const product=await env.DB.prepare("SELECT * FROM products WHERE id=? AND active=1").bind(productId).first();
  if(!product) return fail("Produk tidak ditemukan.",404);
  const available=await env.DB.prepare("SELECT COUNT(*) AS n FROM delivery_items WHERE product_id=? AND status='available'").bind(productId).first();
  if(Number(available?.n||0)<qty) return fail("Stok digital tidak mencukupi. Silakan hubungi admin.",409);
  const orderId=id("WHID");
  const amount=product.price*qty;
  if(!Number.isSafeInteger(amount) || amount<1) return fail("Nominal pesanan tidak valid.");
  await env.DB.prepare(`INSERT INTO orders(id,customer_name,customer_email,customer_contact,product_id,product_name,quantity,unit_price,amount,delivery_status)
    VALUES(?,?,?,?,?,?,?,?,?,'awaiting_payment')`).bind(orderId,name,email,contact,product.id,product.name,qty,product.price,amount).run();
  const reserved=await reserveOrder(env,orderId,product.id,qty);
  if(!reserved) {
    await env.DB.prepare("UPDATE orders SET status='cancelled',delivery_status='awaiting_stock',updated_at=datetime('now') WHERE id=?").bind(orderId).run();
    return fail("Stok baru saja habis. Silakan refresh toko dan coba lagi.",409);
  }
  try {
    const res=await fetch("https://api.apiqris.com/v1/invoices",{
      method:"POST",headers:{"Authorization":`Bearer ${env.APIQRIS_KEY}`,"Content-Type":"application/json","Accept":"application/json"},
      body:JSON.stringify({amount,order_id:orderId,callback_url:`${env.SITE_URL||new URL(request.url).origin}/api/webhook/qris`,redirect_url:`${env.SITE_URL||new URL(request.url).origin}/order.html?id=${orderId}`})
    });
    const invoice=await res.json();
    if(!res.ok || !invoice.id) throw new Error(invoice?.error?.message||"APIQris gagal membuat invoice.");
    await env.DB.prepare("UPDATE orders SET invoice_id=?,total_amount=?,qr_image_url=?,expires_at=?,updated_at=datetime('now') WHERE id=?")
      .bind(invoice.id,Number(invoice.total_amount||amount),String(invoice.qr_image_url||""),invoice.expires_at||null,orderId).run();
    return json({ok:true,order_id:orderId,invoice_id:invoice.id,amount,total_amount:Number(invoice.total_amount||amount),qr_image_url:invoice.qr_image_url||"",expires_at:invoice.expires_at||null});
  } catch(e) {
    await releaseReservation(env,orderId);
    await env.DB.prepare("UPDATE orders SET status='cancelled',delivery_status='cancelled',updated_at=datetime('now') WHERE id=?").bind(orderId).run();
    return fail("Gagal membuat QRIS: "+e.message,502);
  }
}
