<?php
/**
 * سجل العمليات: كل إضافة أو تعديل أو حذف أو دخول يُسجَّل مع الفاعل والجهاز والعنوان.
 */

const ACTION_LABELS = [
    'create'       => ['إضافة', 'ok'],
    'submit'       => ['طلب إضافة', 'warn'],
    'update'       => ['تعديل', 'info'],
    'move'         => ['نقل', 'info'],
    'merge'        => ['دمج', 'info'],
    'reorder'      => ['ترتيب', 'muted'],
    'delete'       => ['حذف', 'danger'],
    'restore'      => ['استعادة', 'ok'],
    'revert'       => ['تراجع', 'info'],
    'approve'      => ['اعتماد', 'ok'],
    'reject'       => ['رفض', 'danger'],
    'suggest'      => ['اقتراح تصحيح', 'warn'],
    'login'        => ['دخول المشرف', 'muted'],
    'login_failed' => ['دخول فاشل', 'danger'],
    'logout'       => ['خروج', 'muted'],
    'code_login'   => ['دخول برمز', 'muted'],
    'code_failed'  => ['رمز خاطئ', 'danger'],
    'code_create'  => ['إنشاء رمز', 'ok'],
    'code_update'  => ['تعديل رمز', 'info'],
    'code_delete'  => ['حذف رمز', 'danger'],
    'admin_create' => ['إضافة مشرف', 'ok'],
    'admin_update' => ['تعديل مشرف', 'info'],
    'settings'     => ['الإعدادات', 'info'],
    'export'       => ['تصدير', 'muted'],
    'install'      => ['تهيئة الموقع', 'ok'],
];

const ACTOR_LABELS = ['admin' => 'مشرف', 'code' => 'رمز بيت', 'public' => 'زائر', 'system' => 'النظام'];

function audit(string $action, ?string $entity = null, ?int $entityId = null, string $summary = '', $before = null, $after = null, ?array $actorOverride = null): void
{
    $a = $actorOverride ?? actor();
    $dev = ua_parse(user_agent());
    db_exec('INSERT INTO audit_log (actor_type, actor_id, actor_label, action, entity, entity_id, summary, before_json, after_json, ip, user_agent, device, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', [
        $a['type'], $a['id'], $a['label'], $action, $entity, $entityId, $summary,
        $before !== null ? json_encode($before, JSON_UNESCAPED_UNICODE) : null,
        $after !== null ? json_encode($after, JSON_UNESCAPED_UNICODE) : null,
        client_ip(), user_agent(), $dev['device'] . ' · ' . $dev['os'] . ' · ' . $dev['browser'], now(),
    ]);
}
