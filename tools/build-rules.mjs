// مولّد قواعد حماية Firebase Realtime Database
// الاستخدام: node tools/build-rules.mjs  ← يكتب database.rules.json
// مفتاح التهيئة الأولى يُقرأ من tools/setup-key.txt (لا يُرفع إلى GitHub)
import { readFileSync, writeFileSync } from 'node:fs';

const KEY = readFileSync(new URL('./setup-key.txt', import.meta.url), 'utf8').trim();
const A = (p) => `root.child('admins/' + auth.uid + '${p}')`;
const C = (p) => `root.child('codes/' + auth.uid + '${p}')`;

const ADMIN = `(auth != null && ${A('/active')}.val() === true)`;
const MANAGER = `(${ADMIN} && ${A('/role')}.val() !== 'editor')`;
const OWNER = `(${ADMIN} && ${A('/role')}.val() === 'owner')`;
const CODE = `(auth != null && ${C('/active')}.val() === true && (!${C('/exp')}.exists() || ${C('/exp')}.val() > now))`;
const NOSCOPE = `!${C('/scope')}.exists()`;
const SC = `${C('/scope')}.val()`;
const IN_OLD = `(${NOSCOPE} || data.child('path').val().contains('/' + ${SC} + '/') || $pid === '' + ${SC})`;
const IN_NEW = `(${NOSCOPE} || newData.child('path').val().contains('/' + ${SC} + '/') || $pid === '' + ${SC})`;
// مسار الأجداد يجب أن يطابق مسار الأب الجديد + رقم الأب (يمنع ربط شخص خارج نطاق الرمز)
const PATH_OK = `(newData.child('path').val() === newData.parent().child('' + newData.child('p').val()).child('path').val() + newData.child('p').val() + '/')`;
const str = (max) => ({ '.validate': `newData.isString() && newData.val().length <= ${max}` });
const num = { '.validate': 'newData.isNumber()' };
const bool = { '.validate': 'newData.isBoolean()' };
const actorRec = { t: str(10), id: { '.validate': 'newData.isString() || newData.isNumber()' }, l: str(120), $other: { '.validate': false } };
const strList = (max) => ({ $i: { '.validate': `newData.isString() && newData.val().length <= ${max}` } });

const rules = {
  rules: {
    '.read': ADMIN, // النسخ الاحتياطي الكامل للمشرف فقط
    '.write': false,
    meta: {
      '.read': true,
      // نسخة البيانات: تتغير مع كل تعديل على الشجرة أو الإعدادات حتى تتحدث ذاكرة المتصفح
      rev: { '.write': `(${ADMIN} || ${CODE}) && newData.val() === now` },
      srev: { '.write': `${MANAGER} && newData.val() === now` },
      installed: { '.read': true, '.write': `!data.exists() && newData.child('key').val() === '${KEY}'` },
      seq: {
        '.read': true,
        '.write': `(${ADMIN} || ${CODE}) && newData.isNumber() && (!data.exists() || (newData.val() > data.val() && newData.val() <= data.val() + 500))`,
      },
    },
    settings: { '.read': true, '.write': MANAGER },
    admins: {
      '.read': ADMIN,
      $uid: {
        '.read': `auth != null && auth.uid === $uid`,
        // التهيئة الأولى: أول حساب يصبح المالك بشرط مفتاح التهيئة
        '.write': `${OWNER} || (!root.child('meta/installed').exists() && auth != null && auth.uid === $uid && newData.child('role').val() === 'owner' && newData.parent().parent().child('meta/installed/key').val() === '${KEY}')`,
        email: str(120), name: str(80), role: { '.validate': "newData.val() === 'owner' || newData.val() === 'admin' || newData.val() === 'editor'" },
        active: bool, at: num, last: num,
        $other: { '.validate': false },
      },
    },
    codes: {
      '.read': ADMIN,
      $uid: {
        '.read': `auth != null && auth.uid === $uid`,
        '.write': MANAGER,
        logins: { '.write': `auth != null && auth.uid === $uid`, ...num },
        // أول استخدام للرمز: يُربط بالجهاز مرة واحدة فقط
        claimed: { '.write': `auth != null && auth.uid === $uid && !data.exists()`, ...num },
        dev: { '.write': `auth != null && auth.uid === $uid && !data.exists()`, ...str(120) },
        last: { '.write': `auth != null && auth.uid === $uid`, ...num },
      },
    },
    codes_secret: { '.read': MANAGER, '.write': MANAGER },
    persons: {
      '.read': true,
      $pid: {
        '.write': `${ADMIN} || (${CODE} && (`
          + `(!data.exists() && newData.exists() && ${C('/add')}.val() === true && ${IN_NEW} && ${PATH_OK})`
          + ` || (data.exists() && newData.exists() && ${C('/edit')}.val() === true && ${IN_OLD} && ${IN_NEW} && (newData.child('path').val() === data.child('path').val() || ${PATH_OK}))`
          + ` || (data.exists() && !newData.exists() && ${C('/del')}.val() === true && ${IN_OLD} && $pid !== '' + ${SC})`
          + `))`,
        '.validate': `$pid.matches(/^[0-9]+$/) && newData.hasChildren(['n', 'k', 'path'])`,
        n: { '.validate': 'newData.isString() && newData.val().length >= 2 && newData.val().length <= 40' },
        k: str(60),
        p: { '.validate': `newData.isNumber() && newData.parent().parent().child('' + newData.val()).exists()` },
        path: str(4000), o: num, g: str(1), nick: str(80), head: bool, house: str(80), hc: str(7),
        b: num, y: num, dead: bool, bio: str(1000), fl: bool, at: num,
        by: actorRec, ub: { l: str(120), at: num, $other: { '.validate': false } },
        $other: { '.validate': false },
      },
    },
    private: { '.read': ADMIN, '.write': ADMIN },
    subs: {
      '.read': `${ADMIN} || (${CODE} && ${C('/approve')}.val() === true)`,
      '.indexOn': ['st'],
      $sid: {
        '.read': true, // من يعرف رقم الطلب فقط (رقم عشوائي طويل)
        '.write': `${ADMIN} || (${CODE} && ${C('/approve')}.val() === true) || (!data.exists() && (newData.child('st').val() === 'pending' || (${CODE} && newData.child('st').val() === 'approved')))`,
        '.validate': `newData.hasChildren(['names', 'st', 'at'])`,
        names: strList(40), sons: strList(40), above: strList(40),
        st: { '.write': `data.val() === 'pending' && newData.val() === 'cancelled'`, '.validate': 'newData.isString()' },
        anchor: num, idx: num, top: num, self: num, fl: bool, at: num, rat: num,
        phone: str(20), note: str(500), nick: str(80), birth: str(4), dev: str(120), ua: str(400), vid: str(40),
        code: str(120), rby: str(120), rnote: str(300), dk: str(40),
        $other: { '.validate': false },
      },
    },
    // منع تكرار الطلب نفسه وهو بانتظار المراجعة
    dups: {
      '.read': true,
      $k: {
        '.write': `!data.exists() || ${ADMIN} || ${CODE} || (!newData.exists() && root.child('subs/' + data.val() + '/st').val() !== 'pending')`,
        '.validate': 'newData.isString() && newData.val().length <= 40',
      },
    },
    trash: { '.read': ADMIN, '.write': `${ADMIN} || (${CODE} && ${C('/del')}.val() === true)` },
    audit: {
      '.read': ADMIN,
      '.indexOn': ['at', 'eid'],
      $aid: {
        '.write': `!data.exists() && newData.exists() && (`
          + `(newData.child('t').val() === 'admin' && ${ADMIN} && newData.child('aid').val() === auth.uid)`
          + ` || (newData.child('t').val() === 'code' && ${CODE} && newData.child('aid').val() === auth.uid)`
          + ` || (newData.child('t').val() === 'public' && (newData.child('a').val() === 'submit' || newData.child('a').val() === 'suggest' || newData.child('a').val() === 'code_failed')))`,
        '.validate': `newData.hasChildren(['t', 'a', 's', 'at']) && newData.child('at').val() === now`,
      },
    },
    visits: {
      '.read': ADMIN,
      '.write': MANAGER, // تفريغ السجل القديم
      '.indexOn': ['at'],
      $vid: {
        '.write': '!data.exists()',
        '.validate': `newData.hasChildren(['v', 'pg', 'at']) && newData.child('at').val() === now`,
        v: str(40), pg: str(20), d: str(10), os: str(40), br: str(40), m: str(60), ref: str(200), sc: str(20), lang: str(20),
        code: str(120), adm: str(80), nw: bool, at: num,
        $other: { '.validate': false },
      },
    },
    suggestions: {
      '.read': ADMIN,
      $sid: {
        '.write': `${ADMIN} || !data.exists()`,
        '.validate': `newData.hasChildren(['msg', 'at'])`,
        pid: num, msg: str(1000), contact: str(80), at: num, st: str(12), rby: str(120), kind: str(10), value: str(40), sib: num, ord: str(800), op: num, who: str(80),
        $other: { '.validate': false },
      },
    },
  },
};

writeFileSync(new URL('../database.rules.json', import.meta.url), JSON.stringify(rules, null, 2));
console.log('database.rules.json written');
