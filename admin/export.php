<?php
/**
 * التصدير والنسخ الاحتياطي: قاعدة البيانات كاملة، JSON، أو CSV للأفراد مع النسب.
 */
require __DIR__ . '/_layout.php';
$types = ['db' => 'نسخة قاعدة البيانات', 'json' => 'الشجرة JSON', 'csv' => 'الأفراد CSV'];
$type = isset($types[$_GET['type'] ?? '']) ? $_GET['type'] : 'csv';
admin_require($type === 'csv' ? 'people' : 'export');

$stamp = date('Y-m-d_His');
audit('export', 'settings', null, 'تصدير ' . $types[$type]);

if ($type === 'db') {
    $tmp = DATA_DIR . '/backup-' . random_token(6) . '.sqlite';
    db()->exec('VACUUM INTO ' . db()->quote($tmp));
    header('Content-Type: application/vnd.sqlite3');
    header('Content-Disposition: attachment; filename="clan-backup-' . $stamp . '.sqlite"');
    header('Content-Length: ' . filesize($tmp));
    readfile($tmp);
    @unlink($tmp);
    exit;
}

$map = people_map(true);
$kids = children_index($map);

if ($type === 'json') {
    $out = [
        'exported_at' => now(), 'site' => setting('site_title'), 'clan' => setting('clan_name'), 'hierarchy' => clan_hierarchy(),
        'persons' => array_values(array_map(fn($p) => [
            'id' => $p['id'], 'parent_id' => $p['parent_id'], 'name' => $p['name'], 'nickname' => $p['nickname'], 'gender' => $p['gender'],
            'is_head' => (int)$p['is_head'], 'house_name' => $p['house_name'], 'house_color' => $p['house_color'],
            'birth_year' => $p['birth_year'], 'death_year' => $p['death_year'], 'is_deceased' => (int)$p['is_deceased'], 'status' => $p['status'],
        ], $map)),
    ];
    header('Content-Type: application/json; charset=utf-8');
    header('Content-Disposition: attachment; filename="clan-tree-' . $stamp . '.json"');
    echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

$details = [];
foreach (db_all('SELECT id, created_by_label, created_at FROM persons WHERE deleted_at IS NULL') as $r) $details[(int)$r['id']] = $r;
header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="clan-people-' . $stamp . '.csv"');
$f = fopen('php://output', 'w');
fwrite($f, "\xEF\xBB\xBF");
fputcsv($f, ['الرقم', 'الاسم', 'النسب الكامل', 'الأب', 'الجيل', 'البيت', 'رأس بيت', 'الكنية', 'الميلاد', 'الوفاة', 'الأبناء', 'الحالة', 'أضافه', 'تاريخ الإضافة']);
foreach ($map as $id => $p) {
    $h = house_of($id, $map);
    fputcsv($f, [
        $id, $p['name'], nasab($id, $map, 0, true), $p['parent_id'] ? ($map[$p['parent_id']]['name'] ?? '') : '', depth_of($id, $map),
        $h ? ($map[$h]['house_name'] ?: 'بيت ' . $map[$h]['name']) : '', (int)$p['is_head'] ? 'نعم' : '', $p['nickname'], $p['birth_year'], $p['death_year'],
        count($kids[$id] ?? []), $p['status'] === 'approved' ? 'معتمد' : 'بانتظار', $details[$id]['created_by_label'] ?? '', $details[$id]['created_at'] ?? '',
    ]);
}
fclose($f);
