// IDs and password scrambling (no plain-text passwords are ever stored).
//
// Each account has a random salt. From the password we make two different one-way codes:
//   verifier  = PBKDF2(password, "v:"+salt)  -> kept on every device, used to log in OFFLINE
//   login key = PBKDF2(password, "k:"+salt)  -> sent once to the server, which stores only
//                                              password_hash(login key). Never kept long on the device.
// Must match api/lib.php (PBKDF2-SHA256, 100 000 rounds, 32 bytes, base64).
const RHB_PBKDF2_ITERATIONS = 100000;

function uuid(){
  try{ if(window.crypto && crypto.randomUUID) return crypto.randomUUID(); }catch(e){ /* not https */ }
  const b = new Uint8Array(16); crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, x=>x.toString(16).padStart(2,'0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
function randomHex(bytes){
  const b = new Uint8Array(bytes); crypto.getRandomValues(b);
  return Array.from(b, x=>x.toString(16).padStart(2,'0')).join('');
}
const utf8Bytes = s => new TextEncoder().encode(s);
function bytesToB64(bytes){ let s = ''; for(let i=0;i<bytes.length;i++) s += String.fromCharCode(bytes[i]); return btoa(s); }

async function pbkdf2B64(password, salt){
  if(window.crypto && crypto.subtle){
    try{
      const key = await crypto.subtle.importKey('raw', utf8Bytes(password), 'PBKDF2', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits({ name:'PBKDF2', hash:'SHA-256', salt: utf8Bytes(salt), iterations: RHB_PBKDF2_ITERATIONS }, key, 256);
      return bytesToB64(new Uint8Array(bits));
    }catch(e){ /* fall through to the plain-JS version */ }
  }
  return bytesToB64(pbkdf2Sha256Js(utf8Bytes(password), utf8Bytes(salt), RHB_PBKDF2_ITERATIONS));
}

async function makePasswordRecord(password){
  const salt = randomHex(16);
  return { pwSalt: salt, pwVerifier: await pbkdf2B64(password, 'v:' + salt), loginKey: await pbkdf2B64(password, 'k:' + salt) };
}
// Offline password check against the stored verifier.
async function checkPassword(account, password){
  if(!account) return false;
  if(typeof account.password === 'string') return account.password === password; // not saved yet
  if(!account.pwSalt || !account.pwVerifier) return false;
  return (await pbkdf2B64(password, 'v:' + account.pwSalt)) === account.pwVerifier;
}

// ---------- Plain-JS PBKDF2-HMAC-SHA256 ----------
// Only used when the browser has no Web Crypto (page opened over plain http on a LAN).
const SHA256_K = new Uint32Array([
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,
  0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,
  0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,
  0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
const SHA256_IV = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
const _shaW = new Uint32Array(64);
function sha256Block(st, b, o){
  const w = _shaW;
  for(let i=0;i<16;i++) w[i] = (b[o+4*i]<<24) | (b[o+4*i+1]<<16) | (b[o+4*i+2]<<8) | b[o+4*i+3];
  for(let i=16;i<64;i++){
    const x = w[i-15], y = w[i-2];
    const s0 = ((x>>>7)|(x<<25)) ^ ((x>>>18)|(x<<14)) ^ (x>>>3);
    const s1 = ((y>>>17)|(y<<15)) ^ ((y>>>19)|(y<<13)) ^ (y>>>10);
    w[i] = (w[i-16] + s0 + w[i-7] + s1) | 0;
  }
  let a=st[0], c1=st[1], c2=st[2], d=st[3], e=st[4], f=st[5], g=st[6], h=st[7];
  for(let i=0;i<64;i++){
    const S1 = ((e>>>6)|(e<<26)) ^ ((e>>>11)|(e<<21)) ^ ((e>>>25)|(e<<7));
    const t1 = (h + S1 + ((e&f) ^ (~e&g)) + SHA256_K[i] + w[i]) | 0;
    const S0 = ((a>>>2)|(a<<30)) ^ ((a>>>13)|(a<<19)) ^ ((a>>>22)|(a<<10));
    const t2 = (S0 + ((a&c1) ^ (a&c2) ^ (c1&c2))) | 0;
    h=g; g=f; f=e; e=(d+t1)|0; d=c2; c2=c1; c1=a; a=(t1+t2)|0;
  }
  st[0]=(st[0]+a)|0; st[1]=(st[1]+c1)|0; st[2]=(st[2]+c2)|0; st[3]=(st[3]+d)|0;
  st[4]=(st[4]+e)|0; st[5]=(st[5]+f)|0; st[6]=(st[6]+g)|0; st[7]=(st[7]+h)|0;
}
// Hash `msg`, continuing from state `init` that has already absorbed `prefixLen` bytes.
function sha256From(init, prefixLen, msg){
  const st = Int32Array.from(init);
  const padLen = ((msg.length + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(padLen);
  buf.set(msg); buf[msg.length] = 0x80;
  const bits = (prefixLen + msg.length) * 8;
  const dv = new DataView(buf.buffer);
  dv.setUint32(padLen-8, Math.floor(bits / 0x100000000)); dv.setUint32(padLen-4, bits >>> 0);
  for(let o=0;o<padLen;o+=64) sha256Block(st, buf, o);
  const out = new Uint8Array(32), odv = new DataView(out.buffer);
  for(let i=0;i<8;i++) odv.setInt32(i*4, st[i]);
  return out;
}
function pbkdf2Sha256Js(pw, salt, iterations){
  let key = pw.length > 64 ? sha256From(SHA256_IV, 0, pw) : pw;
  const ipad = new Uint8Array(64).fill(0x36), opad = new Uint8Array(64).fill(0x5c);
  for(let i=0;i<key.length;i++){ ipad[i] ^= key[i]; opad[i] ^= key[i]; }
  const inner = Int32Array.from(SHA256_IV), outer = Int32Array.from(SHA256_IV);
  sha256Block(inner, ipad, 0); sha256Block(outer, opad, 0);
  const hmac = m => sha256From(outer, 64, sha256From(inner, 64, m));
  const first = new Uint8Array(salt.length + 4); first.set(salt); first[salt.length + 3] = 1;
  let u = hmac(first);
  const t = u.slice();
  for(let i=1;i<iterations;i++){ u = hmac(u); for(let j=0;j<32;j++) t[j] ^= u[j]; }
  return t;
}
