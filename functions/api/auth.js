import {json,fail,id,sha256,pbkdf2,admin,cookie,body} from "./_utils.js";

function validUsername(value) {
  return /^[a-z0-9][a-z0-9_-]{2,31}$/.test(value);
}
function validPassword(value) {
  return typeof value === "string" && /^[a-z0-9]{4,64}$/.test(value);
}

export async function onRequestPost({request,env}) {
  try {
  if (!env.DB) return fail("Binding database D1 bernama DB belum dipasang di Cloudflare Pages.",503);
  const data=await body(request);
  if(!data) return fail("Data tidak valid.");
  const action=data.action;

  if(action==="setup") {
    const count=await env.DB.prepare("SELECT COUNT(*) n FROM admins").first();
    if(count.n>0) return fail("Admin sudah dibuat. Silakan login.",409);

    const username=String(data.username||"").trim().toLowerCase();
    const password=String(data.password||"");
    if(!validUsername(username)) return fail("Username harus 3–32 karakter, huruf kecil, angka, _ atau -; karakter pertama harus huruf/angka.");
    if(!validPassword(password)) return fail("Password hanya boleh huruf kecil dan angka, minimal 4 dan maksimal 64 karakter.");

    const salt=id("SALT");
    const hash=await pbkdf2(password,salt);
    try {
      // The legacy column is named `email`; it stores the username for backward-compatible D1 schema.
      await env.DB.prepare("INSERT INTO admins(id,email,password_hash,password_salt) VALUES(?,?,?,?)")
        .bind(id("ADM"),username,hash,salt).run();
    } catch (e) {
      console.error("WHID admin setup insert error:", e);
      const msg=String(e?.message||e);
      if (/UNIQUE constraint/i.test(msg)) return fail("Username sudah digunakan. Silakan pilih username lain.",409);
      return fail("Gagal menyimpan admin ke D1. Pastikan migration 0001_init.sql sudah dijalankan dan tabel admins memiliki kolom id, email, password_hash, password_salt. Detail: "+msg.slice(0,140),500);
    }
    return json({ok:true,message:"Admin berhasil dibuat. Silakan login menggunakan username."});
  }

  if(action==="login") {
    const username=String(data.username||"").trim().toLowerCase();
    const password=String(data.password||"");
    if(!username || !password) return fail("Username dan password wajib diisi.");
    const row=await env.DB.prepare("SELECT * FROM admins WHERE email=?").bind(username).first();
    if(!row || await pbkdf2(password,row.password_salt)!==row.password_hash) return fail("Username atau password salah.",401);
    const token=id("SESS")+crypto.randomUUID().replaceAll("-","");
    await env.DB.prepare("INSERT INTO sessions(token_hash,admin_id,expires_at) VALUES(?,?,?)")
      .bind(await sha256(token),row.id,Math.floor(Date.now()/1000)+604800).run();
    return json({ok:true,username},200,{"set-cookie":cookie(token)});
  }

  if(action==="logout") {
    const token=request.headers.get("Cookie")?.split(";").map(x=>x.trim()).find(x=>x.startsWith("whid_session="))?.slice(13);
    if(token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha256(token)).run();
    return json({ok:true},200,{"set-cookie":cookie("",0)});
  }
  return fail("Aksi tidak dikenal.");
  } catch (error) {
    console.error("WHID admin auth POST error:", error);
    return fail("Server gagal memproses pembuatan/login admin. Periksa binding D1 bernama DB, tabel admins dan sessions (migration 0001), serta log Functions di Cloudflare. Detail: " + String(error?.message || error).slice(0,180), 500);
  }
}

export async function onRequestGet({request,env}) {
  try {
    const count=await env.DB.prepare("SELECT COUNT(*) n FROM admins").first();
    const user=await admin(request,env);
    return json({setupRequired:Number(count?.n||0)===0,authenticated:!!user,username:user?.email||null});
  } catch (e) {
    return fail("Database admin belum terhubung. Periksa binding D1 dengan nama DB dan jalankan migration 0001_init.sql serta 0002_database_delivery.sql.",503);
  }
}
