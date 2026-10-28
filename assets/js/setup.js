/* ==========================================================================
   التهيئة الأولى: إنشاء حساب المالك، الإعدادات، والجد الأكبر (وبيانات تجريبية اختيارية).
   ========================================================================== */
/* global App */
import { db, auth, ref, get, update, serverTimestamp, createUserWithEmailAndPassword, signInWithEmailAndPassword, DEFAULTS, allocIds, auditEntry } from './store.js?v=14';

const DEMO_TREE = "سلمان\n  عبد الله\n    حسين *بيت حسين\n      علي\n        كاظم\n          جاسم\n            حيدر\n            مرتضى\n          هاشم\n            عباس\n            كرار\n            سجاد\n        عبد الحسين\n          ستار\n            مصطفى\n            منتظر\n          جبار\n            أمير\n      حمزة\n        صالح *بيت صالح الحمزة\n          رحيم\n            أحمد\n            ياسر\n              يوسف\n          كريم\n            زيد\n          عبد الكريم\n            قاسم\n            طالب\n        نوري\n          رعد\n          رياض\n            علاء\n    موسى *بيت موسى\n      محمد *بيت محمد الموسى\n        جعفر\n          عبد الحليم\n          مال الله\n          عبد الأمير\n            حسن\n            حسين\n        مهدي\n          سعد\n            أمير\n            علاء\n          فاضل\n            ليث\n            زين العابدين\n        صادق\n          باقر\n          جواد\n            رضا\n            هادي\n      عيسى\n        إبراهيم\n          خليل\n            محمد\n            سلام\n          داود\n        يعقوب\n          يوسف\n          سليمان\n            عادل\n            ضياء\n    حمد *بيت حمد\n      ناصر\n        خالد\n          وليد\n          ماجد\n        سالم\n          فراس\n          أيمن\n      غانم\n        فرحان\n          شاكر\n          حامد\n            عدنان\n            لؤي\n        عودة\n          خضير\n          جبر\n      سلمان\n        نزار\n        تحسين\n    طاهر\n      عبد الرزاق\n        مازن\n        عمار\n      عبد الجبار\n        هيثم\n          سيف";
const form = document.getElementById('setupForm');
const errBox = document.getElementById('setupErr');
const showErr = (m) => { errBox.textContent = m; errBox.hidden = false; window.scrollTo(0, 0); };

if ((await get(ref(db, 'meta/installed'))).exists()) location.replace('admin');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errBox.hidden = true;
  const f = Object.fromEntries(new FormData(form));
  if ((f.password || '').length < 8) return showErr('كلمة المرور 8 أحرف على الأقل');
  if (f.password !== f.password2) return showErr('كلمتا المرور غير متطابقتين');
  const root = App.Names.clean(f.root);
  if (root.length < 2) return showErr('اكتب اسم الجد الأكبر بالعربية');
  const btn = document.getElementById('setupBtn');
  btn.disabled = true;
  btn.textContent = 'جارِ التهيئة…';
  try {
    let cred;
    try { cred = await createUserWithEmailAndPassword(auth, f.email.trim(), f.password); }
    catch (x) {
      if (String(x.code).includes('email-already-in-use')) cred = await signInWithEmailAndPassword(auth, f.email.trim(), f.password);
      else if (String(x.code).includes('operation-not-allowed') || String(x.code).includes('configuration-not-found')) throw new Error('لم يُفعَّل تسجيل الدخول بالبريد في Firebase بعد. فعّله من Authentication ← Sign-in method ← Email/Password ثم أعد المحاولة.');
      else throw x;
    }
    const uid = cred.user.uid;
    // الخطوة 1: تثبيت الموقع وحساب المالك معاً (القواعد تتحقق من مفتاح التهيئة)
    await update(ref(db), {
      'meta/installed': { key: f.key.trim(), at: serverTimestamp(), by: uid },
      ['admins/' + uid]: { email: f.email.trim(), name: f.name.trim(), role: 'owner', active: true, at: Date.now() },
    }).catch(() => { throw new Error('مفتاح التهيئة غير صحيح أو أن الموقع مُهيأ مسبقاً'); });
    // الخطوة 2: الإعدادات والجد الأكبر (بصلاحية المالك الآن)
    const clan = f.clan.trim().replace(/^عشيرة\s+/, '');
    const a = { t: 'admin', aid: uid, l: 'المشرف: ' + f.name.trim() };
    const u = {
      settings: { ...DEFAULTS, site_title: f.site_title.trim(), clan_name: 'عشيرة ' + clan, laqab: f.laqab.trim(),
        hierarchy: [{ label: 'القبيلة', value: f.tribe.trim() }, { label: 'العشيرة', value: clan }, { label: 'الفخذ', value: f.fakhdh.trim() }] },
      'meta/seq': 1,
      'meta/rev': serverTimestamp(),
      'meta/srev': serverTimestamp(),
      'persons/1': { n: root, k: App.Names.key(root), path: '/', o: 1, by: { t: a.t, id: uid, l: a.l }, at: serverTimestamp() },
    };
    auditEntry(u, a, 'install', 'settings', null, 'تهيئة الموقع على Firebase');
    await update(ref(db), u);
    if (f.demo) await seedDemo(a);
    location.replace('admin');
  } catch (x) {
    console.error(x);
    showErr(x.message || 'تعذرت التهيئة');
    btn.disabled = false;
    btn.textContent = 'تهيئة الموقع';
  }
});

async function seedDemo(a) {
  const lines = DEMO_TREE.split('\n').filter((l) => l.trim());
  const ids = await allocIds(lines.length);
  const stack = { '-1': { id: 1, path: '/' } };
  const order = {};
  const u = {};
  lines.forEach((line, i) => {
    const depth = (line.length - line.trimStart().length) / 2;
    let [name, house] = line.trim().split('*').map((x) => x.trim());
    const par = stack[depth - 1];
    order[par.id] = (order[par.id] || 0) + 1;
    const rec = { n: name, k: App.Names.key(name), p: par.id, path: par.path + par.id + '/', o: order[par.id], by: { t: a.t, id: a.aid, l: a.l }, at: serverTimestamp() };
    if (house) { rec.head = true; rec.house = house; }
    u['persons/' + ids[i]] = rec;
    stack[depth] = { id: ids[i], path: rec.path };
  });
  u['meta/rev'] = serverTimestamp();
  await update(ref(db), u);
}
