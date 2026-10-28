<?php
/**
 * نموذج الأفراد: الشجرة، النسب، الربط الذكي، الإضافة والتعديل والنقل والدمج والحذف، وطلبات الإضافة.
 */

/* ───────────── القراءة ───────────── */

function people_map(bool $withPending = false, bool $refresh = false): array
{
    static $cache = [];
    if ($refresh) {
        $cache = [];
    }
    $k = $withPending ? 'all' : 'approved';
    if (!isset($cache[$k])) {
        $where = $withPending ? "status IN ('approved','pending')" : "status = 'approved'";
        $rows = db_all("SELECT id, parent_id, name, name_key, gender, nickname, is_head, house_name, house_color,
                birth_year, death_year, is_deceased, sort_order, status, submission_id, created_at
            FROM persons WHERE deleted_at IS NULL AND $where ORDER BY sort_order, id");
        $m = [];
        foreach ($rows as $r) {
            $r['id'] = (int)$r['id'];
            $r['parent_id'] = $r['parent_id'] === null ? null : (int)$r['parent_id'];
            $m[$r['id']] = $r;
        }
        $cache[$k] = $m;
    }
    return $cache[$k];
}

function people_refresh(): void
{
    people_map(false, true);
}

function person_row(int $id): ?array
{
    return db_one('SELECT * FROM persons WHERE id = ? AND deleted_at IS NULL', [$id]);
}

function children_index(array $map): array
{
    $kids = [];
    foreach ($map as $id => $p) {
        if ($p['parent_id'] !== null && isset($map[$p['parent_id']])) {
            $kids[$p['parent_id']][] = $id;
        }
    }
    return $kids;
}

/** [الشخص، الأب، الجد، ...، الجذر] */
function lineage_ids(int $id, array $map): array
{
    $out = [];
    $guard = 0;
    while ($id !== null && isset($map[$id]) && $guard++ < 300) {
        $out[] = $id;
        $id = $map[$id]['parent_id'];
    }
    return $out;
}

function nasab(int $id, array $map, int $max = 0, bool $withLaqab = false): string
{
    $ids = lineage_ids($id, $map);
    if ($max > 0) {
        $ids = array_slice($ids, 0, $max);
    }
    $s = implode(' ', array_map(fn($x) => $map[$x]['name'], $ids));
    if ($withLaqab && ($l = laqab_list())) {
        $s .= ' ' . $l[0];
    }
    return $s;
}

function depth_of(int $id, array $map): int
{
    return count(lineage_ids($id, $map));
}

function descendant_ids(int $id, array $kids): array
{
    $out = [];
    $stack = $kids[$id] ?? [];
    while ($stack) {
        $x = array_pop($stack);
        $out[] = $x;
        foreach ($kids[$x] ?? [] as $c) {
            $stack[] = $c;
        }
    }
    return $out;
}

function in_scope(int $personId, ?int $scopeId, array $map): bool
{
    if ($scopeId === null) {
        return true;
    }
    return in_array($scopeId, lineage_ids($personId, $map), true);
}

/** أقرب رأس بيت للشخص (يشمل الشخص نفسه) */
function house_of(int $id, array $map): ?int
{
    foreach (lineage_ids($id, $map) as $x) {
        if ((int)$map[$x]['is_head']) {
            return $x;
        }
    }
    return null;
}

/** الجد الجامع: أول جد من الأعلى له أكثر من ابن — أبناؤه هم رؤوس الفروع التلقائية */
function auto_crown_id(array $map, array $kids): ?int
{
    $roots = array_keys(array_filter($map, fn($p) => $p['parent_id'] === null));
    if (count($roots) !== 1) return null;
    $c = $roots[0];
    $guard = 0;
    while (count($kids[$c] ?? []) === 1 && $guard++ < 300) {
        $c = $kids[$c][0];
    }
    return $c;
}

/** جيل كل شخص (الجذر = 1) بحساب واحد للشجرة كلها */
function depth_map(array $map): array
{
    $depth = [];
    foreach ($map as $id => $_) {
        $x = $id;
        $chain = [];
        while ($x !== null && isset($map[$x]) && !isset($depth[$x]) && count($chain) < 300) {
            $chain[] = $x;
            $x = $map[$x]['parent_id'];
        }
        $base = ($x !== null && isset($depth[$x])) ? $depth[$x] : 0;
        foreach (array_reverse($chain) as $c) {
            $depth[$c] = ++$base;
        }
    }
    return $depth;
}

function tree_stats(): array
{
    $map = people_map();
    $depth = depth_map($map);
    return [
        'persons'     => count($map),
        'houses'      => count(array_filter($map, fn($p) => (int)$p['is_head'])),
        'generations' => $depth ? max($depth) : 0,
        'pending'     => (int)db_val("SELECT COUNT(*) FROM submissions WHERE status = 'pending'"),
        'updated_at'  => db_val('SELECT MAX(COALESCE(updated_at, created_at)) FROM persons'),
    ];
}

/** صيغة مختصرة لإرسال الشجرة للمتصفح */
function person_compact(array $p): array
{
    $o = ['i' => $p['id'], 'p' => $p['parent_id'], 'n' => $p['name']];
    if ((int)$p['is_head']) {
        $o['h'] = $p['house_name'] ?: ('بيت ' . $p['name']);
        if ($p['house_color']) $o['c'] = $p['house_color'];
    }
    if ((int)$p['is_deceased']) $o['d'] = 1;
    if ($p['gender'] === 'f') $o['g'] = 'f';
    if ($p['status'] === 'pending') $o['s'] = 1;
    if ($p['nickname']) $o['k'] = $p['nickname'];
    if (setting('show_years') === '1') {
        if ($p['birth_year']) $o['b'] = (int)$p['birth_year'];
        if ($p['death_year']) $o['y'] = (int)$p['death_year'];
    }
    return $o;
}

/* ───────────── الربط الذكي ───────────── */

/**
 * يبحث عن أفضل نقاط ربط لسلسلة نسب [الشخص، الأب، الجد، ...].
 * لكل مرشح: anchor_id هو أعمق شخص موجود في الشجرة، و anchor_index موقعه في السلسلة؛
 * الأسماء قبل هذا الموقع جديدة وستُضاف تحته.
 */
function match_chain(array $names, int $limit = 5): array
{
    $keys = array_map('name_key', $names);
    $m = count($keys);
    if ($m === 0) {
        return [];
    }
    $map = people_map();
    $cands = [];

    foreach ($map as $id => $p) {
        for ($i = 0; $i < $m; $i++) {
            $s0 = name_sim($p['name_key'], $keys[$i]);
            if ($s0 <= 0) {
                continue;
            }
            $matched = [['id' => $id, 'idx' => $i, 'sim' => $s0]];
            $score = $s0;
            $j = $i + 1;
            $a = $p['parent_id'];
            $conflict = null;
            while ($j < $m && $a !== null && isset($map[$a])) {
                $s = name_sim($map[$a]['name_key'], $keys[$j]);
                if ($s <= 0) {
                    $conflict = ['idx' => $j, 'given' => $names[$j], 'found' => $map[$a]['name']];
                    break;
                }
                $matched[] = ['id' => $a, 'idx' => $j, 'sim' => $s];
                $score += $s;
                $j++;
                $a = $map[$a]['parent_id'];
            }
            $count = count($matched);
            $chainDone = $j >= $m;
            $rootReached = !$chainDone && $conflict === null;

            if ($conflict && $count < 3) {
                continue; // تطابق ضعيف يتبعه اختلاف — مرشح غير موثوق
            }
            if ($count === 1 && !$chainDone && !$rootReached) {
                continue;
            }
            if ($chainDone) $score += 0.5;
            if ($rootReached) $score += 0.2;
            if ($conflict) $score -= 1.5;

            $cands[] = [
                'anchor_id'    => $id,
                'anchor_index' => $i,
                'matched'      => $matched,
                'score'        => $score,
                'conflict'     => $conflict,
                'root_reached' => $rootReached,
                'extra_names'  => $rootReached ? array_slice($names, $j) : [],
            ];
        }
    }

    // حذف المرشحين المحتواة مساراتهم في مرشح أعمق
    $byAnchor = [];
    foreach ($cands as $c) {
        foreach (array_slice($c['matched'], 1) as $mm) {
            $byAnchor[$mm['id'] . ':' . $mm['idx']] = true;
        }
    }
    $cands = array_values(array_filter($cands, fn($c) => !isset($byAnchor[$c['anchor_id'] . ':' . $c['anchor_index']])));

    usort($cands, function ($x, $y) {
        if (abs($x['score'] - $y['score']) > 0.001) return $y['score'] <=> $x['score'];
        return $x['anchor_index'] <=> $y['anchor_index'];
    });

    $top = $cands ? $cands[0]['score'] : 0;
    $out = [];
    foreach (array_slice($cands, 0, $limit) as $c) {
        $count = count($c['matched']);
        $fuzzy = [];
        foreach ($c['matched'] as $mm) {
            if ($mm['sim'] < 1) {
                $fuzzy[] = ['given' => $names[$mm['idx']], 'found' => $map[$mm['id']]['name']];
            }
        }
        $coverage = ($c['anchor_index'] + $count) / max(1, $m);
        $conf = 100 * min(1, $c['score'] / max(1, $m - $c['anchor_index'] + 0.5)) * (0.55 + 0.45 * $coverage);
        if ($c['conflict']) $conf *= 0.6;
        if ($count === 1) $conf = min($conf, 35);
        $path = array_map(fn($mm) => ['id' => $mm['id'], 'name' => $map[$mm['id']]['name']], array_reverse($c['matched']));
        $anchor = $map[$c['anchor_id']];
        $out[] = [
            'anchor_id'    => $c['anchor_id'],
            'anchor_index' => $c['anchor_index'],
            'confidence'   => (int)round(max(5, min(99, $conf))),
            'best'         => abs($c['score'] - $top) < 0.001,
            'path'         => $path,                                  // من الأقدم إلى نقطة الربط
            'above'        => array_map(fn($x) => $map[$x]['name'], array_slice(lineage_ids($c['matched'][$count - 1]['id'], $map), 1, 3)),
            'new_names'    => array_reverse(array_slice($names, 0, $c['anchor_index'])), // من الأقرب للنقطة إلى الشخص
            'exists'       => $c['anchor_index'] === 0,
            'fuzzy'        => $fuzzy,
            'conflict'     => $c['conflict'],
            'extra_names'  => $c['extra_names'],
            'nasab'        => nasab($c['anchor_id'], $map, 8),
            'house'        => ($h = house_of($c['anchor_id'], $map)) ? ($map[$h]['house_name'] ?: 'بيت ' . $map[$h]['name']) : null,
            'children'     => count(array_filter($map, fn($x) => $x['parent_id'] === $anchor['id'])),
        ];
    }
    return $out;
}

/** بحث نصي عن الأفراد */
function people_search(string $q, int $limit = 20, bool $withPending = false): array
{
    $q = trim($q);
    if ($q === '') {
        return [];
    }
    $map = people_map($withPending);
    $parts = array_values(array_filter(array_map('name_key', preg_split('/\s+/u', ar_normalize($q)))));
    $res = [];
    foreach ($map as $id => $p) {
        if (strpos($p['name_key'], $parts[0]) === false) {
            continue;
        }
        $score = $p['name_key'] === $parts[0] ? 3 : (strpos($p['name_key'], $parts[0]) === 0 ? 2 : 1);
        if (count($parts) > 1) {
            $line = lineage_ids($id, $map);
            $ok = true;
            for ($k = 1; $k < count($parts); $k++) {
                $anc = $line[$k] ?? null;
                if ($anc === null || strpos($map[$anc]['name_key'], $parts[$k]) === false) {
                    $ok = false;
                    break;
                }
            }
            if (!$ok) continue;
            $score += 3;
        }
        $res[] = [$score, $id];
    }
    usort($res, fn($a, $b) => $b[0] <=> $a[0] ?: $a[1] <=> $b[1]);
    $out = [];
    foreach (array_slice($res, 0, $limit) as [$s, $id]) {
        $h = house_of($id, $map);
        $out[] = [
            'id'      => $id,
            'name'    => $map[$id]['name'],
            'nasab'   => nasab($id, $map, 6),
            'gen'     => depth_of($id, $map),
            'house'   => $h ? ($map[$h]['house_name'] ?: 'بيت ' . $map[$h]['name']) : null,
            'pending' => $map[$id]['status'] === 'pending',
        ];
    }
    return $out;
}

/* ───────────── الكتابة ───────────── */

const PERSON_EDITABLE = ['name', 'nickname', 'gender', 'is_head', 'house_name', 'house_color', 'birth_year', 'death_year',
    'is_deceased', 'bio', 'phone', 'sort_order'];

const FIELD_LABELS = [
    'name' => 'الاسم', 'nickname' => 'الكنية/اللقب', 'gender' => 'الجنس', 'is_head' => 'رأس بيت', 'house_name' => 'اسم البيت',
    'house_color' => 'لون البيت', 'birth_year' => 'سنة الميلاد', 'death_year' => 'سنة الوفاة', 'is_deceased' => 'متوفى',
    'bio' => 'نبذة', 'phone' => 'الهاتف', 'sort_order' => 'الترتيب', 'parent_id' => 'الأب', 'status' => 'الحالة',
];

function normalize_person_fields(array $in): array
{
    $out = [];
    foreach (PERSON_EDITABLE as $k) {
        if (!array_key_exists($k, $in)) continue;
        $v = $in[$k];
        switch ($k) {
            case 'name':
                $v = name_clean((string)$v);
                if ($err = name_error($v)) throw new InvalidArgumentException($err);
                break;
            case 'is_head':
            case 'is_deceased':
                $v = (int)(bool)$v;
                break;
            case 'gender':
                $v = $v === 'f' ? 'f' : 'm';
                break;
            case 'birth_year':
            case 'death_year':
                $v = trim(latin_digits((string)$v));
                if ($v === '') { $v = null; break; }
                if (!preg_match('/^\d{3,4}$/', $v) || (int)$v > (int)date('Y') + 1) throw new InvalidArgumentException('سنة غير صحيحة: ' . $v);
                $v = (int)$v;
                break;
            case 'sort_order':
                $v = (int)$v;
                break;
            case 'house_color':
                $v = trim((string)$v);
                if ($v !== '' && !preg_match('/^#[0-9a-fA-F]{6}$/', $v)) $v = '';
                $v = $v ?: null;
                break;
            case 'phone':
                $v = preg_replace('/[^\d+]/', '', latin_digits((string)$v));
                $v = $v !== '' ? mb_substr($v, 0, 20) : null;
                break;
            default:
                $v = trim(strip_tags((string)$v));
                $v = $v !== '' ? mb_substr($v, 0, $k === 'bio' ? 1000 : 80) : null;
        }
        $out[$k] = $v;
    }
    return $out;
}

function sibling_with_key(?int $parentId, string $key, ?int $exceptId = null, bool $approvedOnly = false): ?array
{
    $sql = 'SELECT * FROM persons WHERE deleted_at IS NULL AND name_key = ? AND ' . ($parentId === null ? 'parent_id IS NULL' : 'parent_id = ?')
        . ($approvedOnly ? " AND status = 'approved'" : " AND status IN ('approved','pending')");
    $params = [$key];
    if ($parentId !== null) $params[] = $parentId;
    if ($exceptId !== null) {
        $sql .= ' AND id != ?';
        $params[] = $exceptId;
    }
    return db_one($sql . ' LIMIT 1', $params);
}

function person_insert(?int $parentId, array $fields, array $actor, string $status = 'approved', ?int $submissionId = null): int
{
    $f = normalize_person_fields($fields);
    if (empty($f['name'])) {
        throw new InvalidArgumentException('الاسم مطلوب');
    }
    if ($parentId !== null) {
        $parent = person_row($parentId);
        if (!$parent) throw new InvalidArgumentException('الأب غير موجود');
        if ($parent['gender'] === 'f') throw new InvalidArgumentException('الشجرة أبوية: لا يُضاف أبناء تحت الإناث');
    }
    $order = $f['sort_order'] ?? ((int)db_val('SELECT COALESCE(MAX(sort_order), 0) FROM persons WHERE ' . ($parentId === null ? 'parent_id IS NULL' : 'parent_id = ' . (int)$parentId)) + 1);
    $t = now();
    db_exec('INSERT INTO persons (parent_id, name, name_key, gender, nickname, is_head, house_name, house_color, birth_year, death_year,
            is_deceased, bio, phone, sort_order, status, submission_id, created_by_type, created_by_id, created_by_label, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
        $parentId, $f['name'], name_key($f['name']), $f['gender'] ?? 'm', $f['nickname'] ?? null, $f['is_head'] ?? 0,
        $f['house_name'] ?? null, $f['house_color'] ?? null, $f['birth_year'] ?? null, $f['death_year'] ?? null,
        $f['is_deceased'] ?? 0, $f['bio'] ?? null, $f['phone'] ?? null, $order, $status, $submissionId,
        $actor['type'], $actor['id'], $actor['label'], $t, $t,
    ]);
    people_refresh();
    return (int)db()->lastInsertId();
}

/** إضافة ابن مباشرة (للمشرف أو صاحب الرمز) */
function person_add(?int $parentId, array $fields, array $actor): int
{
    $name = name_clean((string)($fields['name'] ?? ''));
    if ($parentId !== null && sibling_with_key($parentId, name_key($name))) {
        throw new InvalidArgumentException('يوجد ابن بالاسم «' . $name . '» تحت هذا الأب مسبقاً');
    }
    $id = person_insert($parentId, $fields, $actor);
    $map = people_map(true);
    $pn = $parentId ? ($map[$parentId]['name'] ?? '') : '';
    audit('create', 'person', $id, $parentId ? 'أضاف «' . $name . '» ابناً لـ «' . $pn . '»' : 'أضاف «' . $name . '» جذراً للشجرة', null, person_row($id));
    return $id;
}

function person_update(int $id, array $fields, array $actor): array
{
    $before = person_row($id);
    if (!$before) throw new InvalidArgumentException('الشخص غير موجود');
    $f = normalize_person_fields($fields);
    if (isset($f['name']) && $f['name'] !== $before['name']) {
        if (sibling_with_key($before['parent_id'] !== null ? (int)$before['parent_id'] : null, name_key($f['name']), $id)) {
            throw new InvalidArgumentException('يوجد أخ بالاسم «' . $f['name'] . '» مسبقاً');
        }
        $f['name_key'] = name_key($f['name']);
    }
    if (isset($f['gender']) && $f['gender'] === 'f' && (int)db_val('SELECT COUNT(*) FROM persons WHERE parent_id = ? AND deleted_at IS NULL', [$id]) > 0) {
        throw new InvalidArgumentException('لا يمكن تحويل شخص له أبناء إلى أنثى');
    }
    $changed = [];
    foreach ($f as $k => $v) {
        if ((string)$before[$k] !== (string)$v) {
            $changed[$k] = $v;
        }
    }
    if (!$changed) {
        return [];
    }
    $changed['updated_at'] = now();
    $changed['updated_by_label'] = $actor['label'];
    $sets = implode(', ', array_map(fn($k) => "$k = ?", array_keys($changed)));
    db_exec("UPDATE persons SET $sets WHERE id = ?", [...array_values($changed), $id]);
    people_refresh();
    $labels = array_map(fn($k) => FIELD_LABELS[$k] ?? $k, array_keys(array_diff_key($changed, ['updated_at' => 1, 'updated_by_label' => 1, 'name_key' => 1])));
    $b = array_intersect_key($before, $changed);
    $a = array_intersect_key(person_row($id), $changed);
    unset($b['updated_at'], $a['updated_at'], $b['updated_by_label'], $a['updated_by_label'], $b['name_key'], $a['name_key']);
    audit('update', 'person', $id, 'عدّل «' . $before['name'] . '»: ' . implode('، ', $labels), $b, $a);
    return $changed;
}

function person_move(int $id, int $newParentId, array $actor): void
{
    $p = person_row($id);
    $np = person_row($newParentId);
    if (!$p || !$np) throw new InvalidArgumentException('الشخص أو الأب الجديد غير موجود');
    if ($id === $newParentId) throw new InvalidArgumentException('لا يمكن نقل الشخص تحت نفسه');
    if ($np['gender'] === 'f') throw new InvalidArgumentException('لا يُضاف أبناء تحت الإناث');
    $map = people_map(true);
    if (in_array($id, lineage_ids($newParentId, $map), true)) {
        throw new InvalidArgumentException('لا يمكن نقل الشخص تحت أحد أحفاده');
    }
    if ((int)$p['parent_id'] === $newParentId) return;
    if (sibling_with_key($newParentId, $p['name_key'], $id)) {
        throw new InvalidArgumentException('يوجد تحت «' . $np['name'] . '» ابن بالاسم نفسه — استخدم الدمج بدلاً من النقل');
    }
    $old = $p['parent_id'] ? person_row((int)$p['parent_id']) : null;
    $order = (int)db_val('SELECT COALESCE(MAX(sort_order), 0) FROM persons WHERE parent_id = ?', [$newParentId]) + 1;
    db_exec('UPDATE persons SET parent_id = ?, sort_order = ?, updated_at = ?, updated_by_label = ? WHERE id = ?', [$newParentId, $order, now(), $actor['label'], $id]);
    people_refresh();
    audit('move', 'person', $id, 'نقل «' . $p['name'] . '» من «' . ($old['name'] ?? '—') . '» إلى «' . $np['name'] . '»',
        ['parent_id' => $p['parent_id'], 'parent' => $old['name'] ?? null], ['parent_id' => $newParentId, 'parent' => $np['name']]);
}

/** دمج شخص مكرر في آخر: ينقل الأبناء (ويدمج المتشابهين منهم) ثم يحذف المكرر */
function person_merge(int $srcId, int $dstId, array $actor, ?string $batch = null, bool $log = true): void
{
    $src = person_row($srcId);
    $dst = person_row($dstId);
    if (!$src || !$dst || $srcId === $dstId) throw new InvalidArgumentException('اختيار غير صحيح للدمج');
    $map = people_map(true);
    if (in_array($srcId, lineage_ids($dstId, $map), true)) {
        throw new InvalidArgumentException('لا يمكن الدمج في أحد أحفاد الشخص نفسه');
    }
    $batch = $batch ?: random_token(6);
    $fill = [];
    foreach (['nickname', 'birth_year', 'death_year', 'bio', 'phone', 'house_name', 'house_color'] as $k) {
        if (($dst[$k] === null || $dst[$k] === '') && $src[$k] !== null && $src[$k] !== '') $fill[$k] = $src[$k];
    }
    if ((int)$src['is_head'] && !(int)$dst['is_head']) $fill['is_head'] = 1;
    if ((int)$src['is_deceased']) $fill['is_deceased'] = 1;
    if ($fill) {
        $sets = implode(', ', array_map(fn($k) => "$k = ?", array_keys($fill)));
        db_exec("UPDATE persons SET $sets WHERE id = ?", [...array_values($fill), $dstId]);
    }
    foreach (db_all('SELECT id, name_key FROM persons WHERE parent_id = ? AND deleted_at IS NULL', [$srcId]) as $child) {
        $twin = sibling_with_key($dstId, $child['name_key']);
        if ($twin) {
            person_merge((int)$child['id'], (int)$twin['id'], $actor, $batch, false);
        } else {
            db_exec('UPDATE persons SET parent_id = ? WHERE id = ?', [$dstId, (int)$child['id']]);
        }
    }
    db_exec('UPDATE persons SET deleted_at = ?, delete_batch = ?, updated_by_label = ? WHERE id = ?', [now(), 'merge:' . $batch, $actor['label'], $srcId]);
    people_refresh();
    if ($log) {
        audit('merge', 'person', $dstId, 'دمج «' . nasab($srcId, lineage_map_with($srcId), 3) . '» في «' . nasab($dstId, people_map(true), 3) . '»', $src, person_row($dstId));
    }
}

/** خريطة تشمل شخصاً محذوفاً (لعرض نسبه في السجل) */
function lineage_map_with(int $id): array
{
    $map = people_map(true);
    $row = db_one('SELECT * FROM persons WHERE id = ?', [$id]);
    if ($row) {
        $row['id'] = (int)$row['id'];
        $row['parent_id'] = $row['parent_id'] === null ? null : (int)$row['parent_id'];
        $map[$row['id']] = $row;
    }
    return $map;
}

function person_delete(int $id, bool $withDescendants, array $actor): int
{
    $p = person_row($id);
    if (!$p) throw new InvalidArgumentException('الشخص غير موجود');
    $map = people_map(true);
    $desc = descendant_ids($id, children_index($map));
    $hasKids = (int)db_val('SELECT COUNT(*) FROM persons WHERE parent_id = ? AND deleted_at IS NULL', [$id]) > 0;
    if ($hasKids && !$withDescendants) {
        throw new InvalidArgumentException('لهذا الشخص أبناء؛ اختر حذفه مع ذريته أو انقل أبناءه أولاً');
    }
    $batch = random_token(6);
    $ids = array_merge([$id], $desc);
    $ph = implode(',', array_fill(0, count($ids), '?'));
    db_exec("UPDATE persons SET deleted_at = ?, delete_batch = ?, updated_by_label = ? WHERE id IN ($ph)", [now(), $batch, $actor['label'], ...$ids]);
    people_refresh();
    $sum = 'حذف «' . nasab($id, $map, 3) . '»' . (count($desc) ? ' مع ' . ar_count(count($desc), 'فرد واحد', 'فردين', 'أفراد', 'فرداً') . ' من ذريته' : '');
    audit('delete', 'person', $id, $sum, ['batch' => $batch, 'count' => count($ids), 'person' => $p], null);
    return count($ids);
}

function restore_batch(string $batch, array $actor): int
{
    $rows = db_all('SELECT * FROM persons WHERE delete_batch = ? AND deleted_at IS NOT NULL ORDER BY id', [$batch]);
    if (!$rows) throw new InvalidArgumentException('لا توجد عناصر لاستعادتها');
    $top = $rows[0];
    if ($top['parent_id'] && !person_row((int)$top['parent_id'])) {
        throw new InvalidArgumentException('لا يمكن الاستعادة: الأب محذوف أيضاً — استعد الأب أولاً');
    }
    if (sibling_with_key($top['parent_id'] !== null ? (int)$top['parent_id'] : null, $top['name_key'])) {
        throw new InvalidArgumentException('لا يمكن الاستعادة: يوجد شخص بالاسم نفسه في الموقع ذاته');
    }
    $n = db_exec('UPDATE persons SET deleted_at = NULL, delete_batch = NULL WHERE delete_batch = ?', [$batch]);
    people_refresh();
    audit('restore', 'person', (int)$top['id'], 'استعاد «' . $top['name'] . '»' . ($n > 1 ? ' مع ' . ($n - 1) . ' من ذريته' : ''), null, ['batch' => $batch, 'count' => $n]);
    return $n;
}

function person_reorder(int $id, string $dir, array $actor): void
{
    $p = person_row($id);
    if (!$p || $p['parent_id'] === null) return;
    $sibs = db_all("SELECT id FROM persons WHERE parent_id = ? AND deleted_at IS NULL AND status != 'rejected' ORDER BY sort_order, id", [(int)$p['parent_id']]);
    $ids = array_map(fn($r) => (int)$r['id'], $sibs);
    $pos = array_search($id, $ids, true);
    $to = $dir === 'up' ? $pos - 1 : $pos + 1;
    if ($pos === false || $to < 0 || $to >= count($ids)) return;
    [$ids[$pos], $ids[$to]] = [$ids[$to], $ids[$pos]];
    foreach ($ids as $i => $sid) {
        db_exec('UPDATE persons SET sort_order = ? WHERE id = ?', [$i + 1, $sid]);
    }
    people_refresh();
    audit('reorder', 'person', $id, 'غيّر ترتيب «' . $p['name'] . '» بين إخوته');
}

/* ───────────── طلبات الإضافة ───────────── */

/**
 * إنشاء طلب إضافة من معالج "أضف نسبك".
 * $in: names[] (الشخص ثم آباؤه)، anchor_id، anchor_index، sons[]، phone، nickname، birth_year، note
 */
function submission_create(array $in, array $actor): array
{
    $names = clean_name_list($in['names'] ?? [], 15);
    if (count($names) < 2) {
        throw new InvalidArgumentException('اكتب اسمك واسم أبيك على الأقل (ويُفضّل الاسم الخماسي)');
    }
    $sons = clean_name_list($in['sons'] ?? [], 25, 'الأبناء');
    $phone = preg_replace('/[^\d+]/', '', latin_digits((string)($in['phone'] ?? '')));
    if (setting('require_phone') === '1' && $actor['type'] === 'public' && strlen($phone) < 8) {
        throw new InvalidArgumentException('رقم الهاتف مطلوب للتحقق');
    }
    $anchorId = isset($in['anchor_id']) && $in['anchor_id'] !== '' && $in['anchor_id'] !== null ? (int)$in['anchor_id'] : null;
    $idx = (int)($in['anchor_index'] ?? 0);
    if ($anchorId !== null) {
        $anchor = person_row($anchorId);
        if (!$anchor || $anchor['status'] !== 'approved') throw new InvalidArgumentException('نقطة الربط غير موجودة');
        if ($idx < 0 || $idx >= count($names)) throw new InvalidArgumentException('نقطة ربط غير صالحة');
        if ($anchor['gender'] === 'f' && $idx > 0) throw new InvalidArgumentException('لا يُضاف أبناء تحت الإناث');
    }

    $mode = setting('registration_mode');
    $status = 'pending';
    if ($actor['type'] === 'admin') {
        $status = 'approved';
    } elseif ($actor['type'] === 'code') {
        $c = current_code();
        if ($anchorId === null || !can_on_person('add', $anchorId)) {
            throw new InvalidArgumentException('نقطة الربط خارج نطاق رمزك — يمكنك الإضافة ضمن بيتك فقط');
        }
        $left = code_additions_left($c);
        if ($left !== null && $left < $idx + count($sons)) {
            throw new InvalidArgumentException('تجاوزت الحد المسموح للإضافات بهذا الرمز');
        }
        $status = setting('code_auto_approve') === '1' ? 'approved' : 'pending';
    } else {
        if ($mode === 'closed') throw new InvalidArgumentException('الإضافة مغلقة حالياً من قبل الإدارة');
        if ($mode === 'codes') throw new InvalidArgumentException('الإضافة متاحة لأصحاب رموز البيوت فقط — اطلب الرمز من رأس بيتك');
    }

    $ua = user_agent();
    $dev = ua_parse($ua);
    $token = random_token(16);
    $t = now();
    db_exec('INSERT INTO submissions (token, chain_json, sons_json, anchor_id, anchor_index, submitter_name, phone, note, status, code_id, ip, user_agent, device, visitor_id, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
        $token, json_encode($names, JSON_UNESCAPED_UNICODE), json_encode($sons, JSON_UNESCAPED_UNICODE), $anchorId, $anchorId !== null ? $idx : null,
        implode(' ', $names), $phone ?: null, mb_substr(trim(strip_tags((string)($in['note'] ?? ''))), 0, 500) ?: null,
        $status === 'approved' ? 'approved' : 'pending', $actor['type'] === 'code' ? $actor['id'] : null,
        client_ip(), $ua, $dev['device'] . ' · ' . $dev['os'] . ' · ' . $dev['browser'], visitor_id(), $t,
    ]);
    $subId = (int)db()->lastInsertId();
    if ($status === 'approved') {
        db_exec('UPDATE submissions SET reviewed_by_label = ?, reviewed_at = ? WHERE id = ?', [$actor['label'] . ' (اعتماد تلقائي)', $t, $subId]);
    }

    $selfId = null;
    $created = [];
    if ($anchorId !== null) {
        $sub = db_one('SELECT * FROM submissions WHERE id = ?', [$subId]);
        [$selfId, $created] = submission_build($sub, $status, $actor, [
            'phone' => $phone ?: null,
            'nickname' => $in['nickname'] ?? null,
            'birth_year' => $in['birth_year'] ?? null,
        ]);
    }

    $label = $actor['type'] === 'public' ? 'زائر: ' . implode(' ', array_slice($names, 0, 3)) . ($phone ? ' (' . $phone . ')' : '') : $actor['label'];
    $sum = ($status === 'approved' ? 'أضاف نسب ' : 'طلب إضافة نسب ') . '«' . implode(' ', $names) . '»'
        . ($anchorId === null ? ' — بدون ربط (بانتظار المشرف)' : ($created ? ' — ' . ar_count(count($created), 'اسم جديد', 'اسمان جديدان', 'أسماء جديدة', 'اسماً جديداً') : ''));
    audit($status === 'approved' ? 'create' : 'submit', 'submission', $subId, $sum, null,
        ['names' => $names, 'sons' => $sons, 'anchor_id' => $anchorId, 'created' => $created], ['type' => $actor['type'], 'id' => $actor['id'], 'label' => $label]);

    return ['token' => $token, 'status' => $status, 'self_id' => $selfId, 'created' => $created, 'submission_id' => $subId];
}

/**
 * إنشاء أشخاص الطلب تحت نقطة الربط. يعيد [معرّف الشخص نفسه، المعرفات المنشأة].
 */
function submission_build(array $sub, string $status, array $actor, array $selfExtra = []): array
{
    $names = json_decode($sub['chain_json'], true) ?: [];
    $sons = json_decode($sub['sons_json'] ?? '[]', true) ?: [];
    $parent = (int)$sub['anchor_id'];
    $idx = (int)$sub['anchor_index'];
    $created = [];
    $label = $actor['type'] === 'public' ? 'زائر: ' . implode(' ', array_slice($names, 0, 3)) . ($sub['phone'] ? ' (' . $sub['phone'] . ')' : '') : $actor['label'];
    $act = ['type' => $actor['type'], 'id' => $actor['id'], 'label' => $label];

    for ($k = $idx - 1; $k >= 0; $k--) {
        $existing = sibling_with_key($parent, name_key($names[$k]));
        if ($existing && ($existing['status'] === 'approved' || (int)$existing['submission_id'] === (int)$sub['id'])) {
            $parent = (int)$existing['id'];
            continue;
        }
        $fields = ['name' => $names[$k]];
        if ($k === 0) {
            $fields += array_filter($selfExtra, fn($v) => $v !== null && $v !== '');
        }
        $parent = person_insert($parent, $fields, $act, $status, (int)$sub['id']);
        $created[] = $parent;
    }
    $selfId = $parent;
    foreach ($sons as $s) {
        if (sibling_with_key($selfId, name_key($s))) continue;
        $created[] = person_insert($selfId, ['name' => $s], $act, $status, (int)$sub['id']);
    }
    db_exec('UPDATE submissions SET self_person_id = ? WHERE id = ?', [$selfId, (int)$sub['id']]);
    return [$selfId, $created];
}

/** اعتماد طلب: مع إمكانية تغيير نقطة الربط، ودمج تلقائي مع الإخوة المطابقين */
function submission_approve(int $subId, array $actor, ?int $newAnchor = null, ?int $newIndex = null): array
{
    $sub = db_one('SELECT * FROM submissions WHERE id = ?', [$subId]);
    if (!$sub || $sub['status'] !== 'pending') throw new InvalidArgumentException('الطلب غير موجود أو تمت مراجعته');
    $names = json_decode($sub['chain_json'], true) ?: [];

    if ($newAnchor !== null) {
        if (!person_row($newAnchor)) throw new InvalidArgumentException('نقطة الربط الجديدة غير موجودة');
        $newIndex = max(0, min(count($names) - 1, (int)$newIndex));
        db_exec("DELETE FROM persons WHERE submission_id = ? AND status = 'pending'", [$subId]);
        db_exec('UPDATE submissions SET anchor_id = ?, anchor_index = ? WHERE id = ?', [$newAnchor, $newIndex, $subId]);
        people_refresh();
        $sub = db_one('SELECT * FROM submissions WHERE id = ?', [$subId]);
        submission_build($sub, 'pending', ['type' => 'public', 'id' => null, 'label' => 'زائر'], ['phone' => $sub['phone']]);
    }
    if ($sub['anchor_id'] === null) throw new InvalidArgumentException('حدد نقطة الربط أولاً');

    $merged = [];
    $rows = db_all("SELECT * FROM persons WHERE submission_id = ? AND status = 'pending' AND deleted_at IS NULL ORDER BY id", [$subId]);
    foreach ($rows as $r) {
        $r = person_row((int)$r['id']);
        if (!$r) continue;
        $twin = sibling_with_key($r['parent_id'] !== null ? (int)$r['parent_id'] : null, $r['name_key'], (int)$r['id'], true);
        if ($twin) {
            db_exec('UPDATE persons SET parent_id = ? WHERE parent_id = ? AND deleted_at IS NULL', [(int)$twin['id'], (int)$r['id']]);
            db_exec("UPDATE persons SET status = 'rejected', deleted_at = ?, delete_batch = ? WHERE id = ?", [now(), 'dup:' . $subId, (int)$r['id']]);
            if ((int)$sub['self_person_id'] === (int)$r['id']) {
                db_exec('UPDATE submissions SET self_person_id = ? WHERE id = ?', [(int)$twin['id'], $subId]);
            }
            $merged[] = $r['name'];
        } else {
            db_exec("UPDATE persons SET status = 'approved', updated_at = ?, updated_by_label = ? WHERE id = ?", [now(), $actor['label'], (int)$r['id']]);
        }
    }
    db_exec("UPDATE submissions SET status = 'approved', reviewed_by_label = ?, reviewed_at = ? WHERE id = ?", [$actor['label'], now(), $subId]);
    people_refresh();
    audit('approve', 'submission', $subId, 'اعتمد طلب «' . implode(' ', $names) . '»' . ($merged ? ' (دُمج تلقائياً: ' . implode('، ', $merged) . ')' : ''));
    return ['merged' => $merged];
}

function submission_reject(int $subId, array $actor, string $note = ''): void
{
    $sub = db_one('SELECT * FROM submissions WHERE id = ?', [$subId]);
    if (!$sub || $sub['status'] !== 'pending') throw new InvalidArgumentException('الطلب غير موجود أو تمت مراجعته');
    db_exec("UPDATE persons SET status = 'rejected', deleted_at = ? WHERE submission_id = ? AND status = 'pending'", [now(), $subId]);
    db_exec("UPDATE submissions SET status = 'rejected', reviewed_by_label = ?, reviewed_at = ?, review_note = ? WHERE id = ?", [$actor['label'], now(), $note ?: null, $subId]);
    people_refresh();
    $names = json_decode($sub['chain_json'], true) ?: [];
    audit('reject', 'submission', $subId, 'رفض طلب «' . implode(' ', $names) . '»' . ($note ? ': ' . $note : ''));
}

/** هل يمكن لصاحب الرمز الحالي اعتماد هذا الطلب؟ */
function can_approve_submission(array $sub): bool
{
    if (current_admin()) return true;
    return $sub['anchor_id'] !== null && can_on_person('approve', (int)$sub['anchor_id']);
}
