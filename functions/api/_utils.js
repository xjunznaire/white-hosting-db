const json = (data, status=200, headers={}) => {
  // Accept both json(data, status, headers) and the older json(data, {headers}) form.
  if (status && typeof status === "object") {
    headers = status.headers || status;
    status = 200;
  }
  if (!Number.isInteger(status) || status < 200 || status > 599) status = 500;
  return new Response(JSON.stringify(data), {
    status,
    headers: {"content-type":"application/json; charset=utf-8", "cache-control":"no-store", ...headers}
  });
};
const fail = (message, status=400) => json({error:message}, status);
const id = (prefix="") => prefix + crypto.randomUUID().replaceAll("-","").slice(0,18).toUpperCase();
const money = n => new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(n);
async function sha256(text) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function pbkdf2(password, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({name:"PBKDF2",salt:new TextEncoder().encode(salt),iterations:100000,hash:"SHA-256"},key,256);
  return [...new Uint8Array(bits)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function admin(request, env) {
  const token = request.headers.get("Cookie")?.split(";").map(x=>x.trim()).find(x=>x.startsWith("whid_session="))?.slice(13);
  if (!token) return null;
  const hash = await sha256(token);
  const row = await env.DB.prepare("SELECT admins.id, admins.email, admins.email AS username FROM sessions JOIN admins ON admins.id=sessions.admin_id WHERE sessions.token_hash=? AND sessions.expires_at>?").bind(hash, Math.floor(Date.now()/1000)).first();
  return row || null;
}
function cookie(token, maxAge=604800) {
  return `whid_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}
async function body(request) {
  try { return await request.json(); } catch { return null; }
}
export {json,fail,id,sha256,pbkdf2,admin,cookie,body};
