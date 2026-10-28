<?php
/**
 * واجهة JSON للشجرة: العرض، البحث، الربط الذكي، الإضافة، رموز البيوت، والتعديل.
 */
require __DIR__ . '/includes/bootstrap.php';

$action = (string)($_GET['action'] ?? '');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

$in = $_POST;
if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== false) {
    $in = json_decode((string)file_get_contents('php://input'), true) ?: [];
    if (isset($_SERVER['HTTP_X_CSRF_TOKEN'])) {
        $_POST['_csrf'] = $_SERVER['HTTP_X_CSRF_TOKEN'];
    }
}

function fail(string $msg, int $status = 400): void
{
    json_out(['ok' => false, 'error' => $msg], $status);
}

function need_post(): void
{
    global $method;
    if ($method !== 'POST') fail('طريقة طلب غير صحيحة', 405);
    if (!csrf_valid()) fail('انتهت صلاحية الجلسة، حدّث الصفحة وأعد المحاولة', 419);
}

function int_in(array $in, string $k): ?int
{
    return isset($in[$k]) && $in[$k] !== '' && $in[$k] !== null ? (int)$in[$k] : null;
}

function viewer_info(): array
{
    $a = actor();
    $c = current_code();
    $v = ['type' => $a['type'], 'label' => $a['label'], 'scope' => null, 'perms' => []];
    if ($a['type'] === 'admin') {
        $v['perms'] = ['add' => true, 'edit' => true, 'delete' => true, 'approve' => true, 'merge' => true];
    } elseif ($c) {
        $v['scope'] = $c['scope_person_id'] !== null ? (int)$c['scope_person_id'] : null;
        $v['perms'] = ['add' => (bool)$c['can_add'], 'edit' => (bool)$c['can_edit'], 'delete' => (bool)$c['can_delete'], 'approve' => (bool)$c['can_approve'],
            'merge' => (bool)$c['can_delete'] && (bool)$c['can_edit']];
        $v['holder'] = $c['holder_name'];
    }
    if (!empty($v['perms']['approve'])) {
        $v['pending'] = count(reviewable_submissions());
    }
    return $v;
}

/** الطلبات المعلقة التي يستطيع المستخدم الحالي اعتمادها (المشرف: كلها، صاحب الرمز: ضمن نطاقه) */
function reviewable_submissions(): array
{
    return array_values(array_filter(db_all("SELECT * FROM submissions WHERE status = 'pending' ORDER BY id DESC LIMIT 300"),
        fn($s) => can_approve_submission($s) && $s['anchor_id'] !== null));
}

try {
    switch ($action) {

        case 'tree': {
            $privileged = current_admin() || current_code();
            $map = people_map(true);
            $tokens = array_slice(array_filter(explode(',', (string)($_GET['tokens'] ?? '')), fn($t) => preg_match('/^[a-f0-9]{32}$/', $t)), 0, 20);
            $mySubs = [];
            if ($tokens) {
                $ph = implode(',', array_fill(0, count($tokens), '?'));
                foreach (db_all("SELECT id FROM submissions WHERE token IN ($ph)", $tokens) as $r) {
                    $mySubs[(int)$r['id']] = true;
                }
            }
            $showF = setting('show_females') === '1' || current_admin();
            $out = [];
            foreach ($map as $p) {
                if ($p['status'] === 'pending' && !$privileged && !isset($mySubs[(int)$p['submission_id']])) continue;
                if ($p['gender'] === 'f' && !$showF) continue;
                $c = person_compact($p);
                if ($p['status'] === 'pending' && isset($mySubs[(int)$p['submission_id']])) $c['m'] = 1;
                $out[] = $c;
            }
            json_out(['ok' => true, 'persons' => $out, 'viewer' => viewer_info()]);
        }

        case 'search': {
            $q = mb_substr((string)($_GET['q'] ?? ''), 0, 80);
            json_out(['ok' => true, 'results' => people_search($q, 20, (bool)(current_admin() || current_code()))]);
        }

        case 'match': {
            need_post();
            if (!rate_limit('match:' . client_ip(), 60, 600)) fail('محاولات كثيرة، انتظر قليلاً', 429);
            $names = clean_name_list($in['names'] ?? [], 15);
            if (count($names) < 1) fail('اكتب الاسم أولاً');
            json_out(['ok' => true, 'candidates' => match_chain($names, 5), 'names' => $names]);
        }

        case 'submit': {
            need_post();
            if (!empty($in['website'])) fail('تعذر الإرسال'); // فخ الروبوتات
            $limit = max(1, (int)setting('submissions_per_hour'));
            if (actor()['type'] === 'public' && !rate_limit('submit:' . client_ip(), $limit, 3600)) {
                fail('وصلت للحد الأقصى من الطلبات في الساعة، حاول لاحقاً', 429);
            }
            $res = submission_create($in, actor());
            json_out(['ok' => true] + $res);
        }

        case 'my_submissions': {
            need_post();
            $tokens = array_slice(array_filter((array)($in['tokens'] ?? []), fn($t) => is_string($t) && preg_match('/^[a-f0-9]{32}$/', $t)), 0, 20);
            $list = [];
            if ($tokens) {
                $ph = implode(',', array_fill(0, count($tokens), '?'));
                foreach (db_all("SELECT * FROM submissions WHERE token IN ($ph) ORDER BY id DESC", array_values($tokens)) as $s) {
                    $persons = db_all("SELECT id, name, parent_id, status FROM persons WHERE submission_id = ? AND deleted_at IS NULL ORDER BY id", [(int)$s['id']]);
                    $list[] = [
                        'token' => $s['token'], 'status' => $s['status'], 'names' => json_decode($s['chain_json'], true),
                        'created_at' => fmt_dt($s['created_at']), 'self_id' => $s['self_person_id'] ? (int)$s['self_person_id'] : null,
                        'note' => $s['review_note'], 'persons' => $persons, 'linked' => $s['anchor_id'] !== null,
                    ];
                }
            }
            json_out(['ok' => true, 'items' => $list]);
        }

        case 'submission_cancel': {
            need_post();
            $sub = db_one('SELECT * FROM submissions WHERE token = ?', [(string)($in['token'] ?? '')]);
            if (!$sub || $sub['status'] !== 'pending') fail('لا يمكن إلغاء هذا الطلب');
            submission_reject((int)$sub['id'], ['type' => 'public', 'id' => null, 'label' => 'صاحب الطلب'], 'ألغاه صاحب الطلب');
            json_out(['ok' => true]);
        }

        case 'submission_rename': {
            need_post();
            $sub = db_one('SELECT * FROM submissions WHERE token = ?', [(string)($in['token'] ?? '')]);
            if (!$sub || $sub['status'] !== 'pending') fail('لا يمكن تعديل هذا الطلب بعد مراجعته');
            $pid = (int)($in['person_id'] ?? 0);
            $p = db_one("SELECT * FROM persons WHERE id = ? AND submission_id = ? AND status = 'pending'", [$pid, (int)$sub['id']]);
            if (!$p) fail('الاسم غير موجود في طلبك');
            person_update($pid, ['name' => (string)($in['name'] ?? '')], ['type' => 'public', 'id' => null, 'label' => 'صاحب الطلب']);
            json_out(['ok' => true]);
        }

        case 'code_login': {
            need_post();
            if (!rate_limit('code:' . client_ip(), 8, 900)) fail('محاولات كثيرة خاطئة، انتظر 15 دقيقة', 429);
            $raw = preg_replace('/[^0-9]/', '', latin_digits((string)($in['code'] ?? '')));
            $code = strlen($raw) === 8 ? substr($raw, 0, 4) . '-' . substr($raw, 4) : '';
            $c = $code ? db_one('SELECT * FROM codes WHERE code = ?', [$code]) : null;
            if (!$c || !code_is_usable($c)) {
                audit('code_failed', 'code', $c ? (int)$c['id'] : null, 'محاولة دخول برمز غير صالح' . ($c ? ' (معطّل أو منتهي)' : ''));
                fail($c ? 'هذا الرمز معطّل أو منتهي الصلاحية' : 'الرمز غير صحيح');
            }
            session_regenerate_id(true);
            $_SESSION['code_id'] = (int)$c['id'];
            db_exec('UPDATE codes SET login_count = login_count + 1, last_used_at = ?, last_used_ip = ? WHERE id = ?', [now(), client_ip(), (int)$c['id']]);
            db_exec('UPDATE visits SET code_id = ? WHERE visitor_id = ? AND code_id IS NULL', [(int)$c['id'], visitor_id()]);
            audit('code_login', 'code', (int)$c['id'], 'دخول برمز «' . $c['holder_name'] . '»', null, null,
                ['type' => 'code', 'id' => (int)$c['id'], 'label' => 'رمز: ' . $c['holder_name']]);
            json_out(['ok' => true, 'holder' => $c['holder_name'], 'scope' => $c['scope_person_id']]);
        }

        case 'code_logout': {
            need_post();
            unset($_SESSION['code_id']);
            json_out(['ok' => true]);
        }

        case 'person': {
            $id = (int)($_GET['id'] ?? 0);
            $privileged = current_admin() || current_code();
            $p = person_row($id);
            if (!$p || ($p['status'] !== 'approved' && !$privileged && $p['status'] !== 'pending')) fail('الشخص غير موجود', 404);
            $map = people_map(true);
            $kids = children_index($map);
            $line = lineage_ids($id, $map);
            $h = house_of($id, $map);
            $children = [];
            foreach ($kids[$id] ?? [] as $cid) {
                $children[] = ['id' => $cid, 'name' => $map[$cid]['name'], 'head' => (int)$map[$cid]['is_head'], 'kids' => count($kids[$cid] ?? []),
                    'pending' => $map[$cid]['status'] === 'pending'];
            }
            $sub = $p['submission_id'] ? db_one('SELECT id, status, token FROM submissions WHERE id = ?', [(int)$p['submission_id']]) : null;
            $showBy = $privileged || setting('show_added_by') === '1';
            $out = [
                'id' => $id, 'name' => $p['name'], 'nickname' => $p['nickname'], 'gender' => $p['gender'],
                'is_head' => (int)$p['is_head'], 'house_name' => $p['house_name'], 'house_color' => $p['house_color'],
                'birth_year' => $p['birth_year'], 'death_year' => $p['death_year'], 'is_deceased' => (int)$p['is_deceased'],
                'bio' => $p['bio'], 'status' => $p['status'], 'floating' => (int)$p['floating'], 'sort_order' => (int)$p['sort_order'],
                'created_at' => fmt_dt($p['created_at'], false), 'updated_at' => fmt_dt($p['updated_at']),
                'created_by' => $showBy ? $p['created_by_label'] : null, 'updated_by' => $showBy ? $p['updated_by_label'] : null,
                'lineage' => array_map(fn($x) => ['id' => $x, 'name' => $map[$x]['name']], $line),
                'gen' => count($line),
                'children' => $children,
                'descendants' => count(descendant_ids($id, $kids)),
                'siblings' => $p['parent_id'] ? max(0, count($kids[(int)$p['parent_id']] ?? []) - 1) : 0,
                'house' => $h ? ['id' => $h, 'name' => $map[$h]['house_name'] ?: 'بيت ' . $map[$h]['name']] : null,
                'submission' => $sub && $sub['status'] === 'pending' ? ['id' => (int)$sub['id']] : null,
                'perms' => [
                    'add' => can_on_person('add', $id) && $p['gender'] !== 'f',
                    'edit' => can_on_person('edit', $id),
                    'move' => can_on_person('move', $id) && $p['parent_id'] !== null,
                    'reorder' => can_on_person('reorder', $id) && $p['parent_id'] !== null,
                    'delete' => can_on_person('delete', $id),
                    'approve' => $sub && $sub['status'] === 'pending' && can_approve_submission(db_one('SELECT * FROM submissions WHERE id = ?', [(int)$sub['id']])),
                    'merge' => can_on_person('delete', $id) && can_on_person('edit', $id),
                    'head' => (bool)current_admin() || (current_code() && can_on_person('edit', $id)),
                ],
            ];
            if (current_admin()) {
                $out['phone'] = $p['phone'];
            }
            json_out(['ok' => true, 'person' => $out]);
        }

        case 'person_add': {
            need_post();
            $parent = int_in($in, 'parent_id');
            if (!can_on_person('add', $parent)) fail('لا تملك صلاحية الإضافة هنا', 403);
            if (($c = current_code()) && !current_admin()) {
                $left = code_additions_left($c);
                if ($left !== null && $left < 1) fail('تجاوزت الحد المسموح للإضافات بهذا الرمز', 403);
            }
            $fields = array_intersect_key($in, array_flip(['name', 'nickname', 'gender', 'birth_year', 'is_deceased', 'is_head', 'house_name']));
            $id = person_add($parent, $fields, actor());
            json_out(['ok' => true, 'id' => $id]);
        }

        case 'person_update': {
            need_post();
            $id = (int)($in['id'] ?? 0);
            if (!can_on_person('edit', $id)) fail('لا تملك صلاحية التعديل هنا', 403);
            $allowed = ['name', 'nickname', 'gender', 'birth_year', 'death_year', 'is_deceased', 'bio', 'is_head', 'house_name', 'house_color'];
            if (current_admin()) $allowed[] = 'phone';
            $changed = person_update($id, array_intersect_key($in, array_flip($allowed)), actor());
            json_out(['ok' => true, 'changed' => array_keys($changed)]);
        }

        case 'person_move': {
            need_post();
            $id = (int)($in['id'] ?? 0);
            $to = (int)($in['parent_id'] ?? 0);
            if (!can_on_person('move', $id) || !can_on_person('add', $to)) fail('لا تملك صلاحية النقل هنا', 403);
            person_move($id, $to, actor());
            json_out(['ok' => true]);
        }

        case 'person_merge': {
            need_post();
            $id = (int)($in['id'] ?? 0);
            $target = (int)($in['target_id'] ?? 0);
            if (!can_on_person('delete', $id) || !can_on_person('edit', $target)) fail('لا تملك صلاحية الدمج هنا', 403);
            person_merge($id, $target, actor());
            json_out(['ok' => true]);
        }

        case 'pending': {
            $c = current_code();
            if (!current_admin() && !($c && (int)$c['can_approve'])) fail('لا تملك صلاحية مراجعة الطلبات', 403);
            $map = people_map(true);
            $items = [];
            foreach (reviewable_submissions() as $s) {
                $persons = db_all("SELECT id, name, parent_id, name_key FROM persons WHERE submission_id = ? AND status = 'pending' AND deleted_at IS NULL ORDER BY id", [(int)$s['id']]);
                $dups = [];
                foreach ($persons as $p) {
                    if (sibling_with_key($p['parent_id'] !== null ? (int)$p['parent_id'] : null, $p['name_key'], (int)$p['id'], true)) $dups[] = $p['name'];
                }
                $items[] = [
                    'id' => (int)$s['id'], 'names' => json_decode($s['chain_json'], true) ?: [],
                    'anchor' => (int)$s['anchor_index'] >= count(json_decode($s['chain_json'], true) ?: []) ? 'فرع جديد لم يُربط بأجداده بعد' : (isset($map[(int)$s['anchor_id']]) ? nasab((int)$s['anchor_id'], $map, 6) : null),
                    'above' => json_decode((string)$s['above_json'], true) ?: [],
                    'new' => array_column($persons, 'name'), 'dups' => $dups,
                    'self_id' => $s['self_person_id'] ? (int)$s['self_person_id'] : null,
                    'phone' => $s['phone'], 'note' => $s['note'], 'ago' => time_ago($s['created_at']), 'device' => $s['device'],
                ];
            }
            json_out(['ok' => true, 'items' => $items]);
        }

        case 'person_delete': {
            need_post();
            $id = (int)($in['id'] ?? 0);
            if (!can_on_person('delete', $id)) fail('لا تملك صلاحية الحذف هنا', 403);
            $n = person_delete($id, !empty($in['with_desc']), actor());
            json_out(['ok' => true, 'count' => $n]);
        }

        case 'person_reorder': {
            need_post();
            $id = (int)($in['id'] ?? 0);
            if (!can_on_person('reorder', $id)) fail('لا تملك صلاحية الترتيب هنا', 403);
            person_reorder($id, ($in['dir'] ?? '') === 'up' ? 'up' : 'down', actor());
            json_out(['ok' => true]);
        }

        case 'submission_approve':
        case 'submission_reject': {
            need_post();
            $sub = db_one('SELECT * FROM submissions WHERE id = ?', [(int)($in['submission_id'] ?? 0)]);
            if (!$sub || !can_approve_submission($sub)) fail('لا تملك صلاحية مراجعة هذا الطلب', 403);
            if ($action === 'submission_approve') {
                $r = submission_approve((int)$sub['id'], actor());
                json_out(['ok' => true] + $r);
            }
            submission_reject((int)$sub['id'], actor(), (string)($in['note'] ?? ''));
            json_out(['ok' => true]);
        }

        case 'suggest': {
            need_post();
            if (!rate_limit('suggest:' . client_ip(), 10, 3600)) fail('محاولات كثيرة، حاول لاحقاً', 429);
            $msg = trim(strip_tags((string)($in['message'] ?? '')));
            if (mb_strlen($msg) < 5) fail('اكتب تفاصيل التصحيح المطلوب');
            $pid = int_in($in, 'person_id');
            db_exec('INSERT INTO suggestions (person_id, message, contact, ip, user_agent, created_at) VALUES (?,?,?,?,?,?)', [
                $pid, mb_substr($msg, 0, 1000), mb_substr(trim(strip_tags((string)($in['contact'] ?? ''))), 0, 80) ?: null, client_ip(), user_agent(), now(),
            ]);
            $map = people_map(true);
            audit('suggest', 'person', $pid, 'اقتراح تصحيح على «' . ($pid && isset($map[$pid]) ? nasab($pid, $map, 3) : '—') . '»: ' . mb_substr($msg, 0, 80));
            json_out(['ok' => true]);
        }

        case 'beacon': {
            need_post();
            $vid = (int)($in['v'] ?? 0);
            if ($vid && $vid === (int)($_SESSION['last_visit_id'] ?? 0)) {
                $sw = (int)($in['sw'] ?? 0);
                $sh = (int)($in['sh'] ?? 0);
                db_exec('UPDATE visits SET screen = ? WHERE id = ? AND visitor_id = ?', [$sw . '×' . $sh, $vid, visitor_id()]);
            }
            json_out(['ok' => true]);
        }

        default:
            fail('إجراء غير معروف', 404);
    }
} catch (InvalidArgumentException $e) {
    fail($e->getMessage());
} catch (Throwable $e) {
    error_log('[api:' . $action . '] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    fail('حدث خطأ غير متوقع', 500);
}
