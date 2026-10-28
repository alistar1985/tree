<?php
/**
 * بنية قاعدة البيانات والإعدادات الافتراضية.
 */

function schema_ensure(PDO $pdo): void
{
    $pdo->exec(<<<SQL
CREATE TABLE IF NOT EXISTS settings (
    k TEXT PRIMARY KEY,
    v TEXT
);

CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    role TEXT NOT NULL DEFAULT 'editor',
    is_active INTEGER NOT NULL DEFAULT 1,
    last_login_at TEXT,
    last_login_ip TEXT,
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS persons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER,
    name TEXT NOT NULL,
    name_key TEXT NOT NULL,
    gender TEXT NOT NULL DEFAULT 'm',
    nickname TEXT,
    is_head INTEGER NOT NULL DEFAULT 0,
    house_name TEXT,
    house_color TEXT,
    birth_year INTEGER,
    death_year INTEGER,
    is_deceased INTEGER NOT NULL DEFAULT 0,
    bio TEXT,
    phone TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    floating INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'approved',
    submission_id INTEGER,
    created_by_type TEXT,
    created_by_id INTEGER,
    created_by_label TEXT,
    updated_by_label TEXT,
    created_at TEXT,
    updated_at TEXT,
    deleted_at TEXT,
    delete_batch TEXT
);
CREATE INDEX IF NOT EXISTS idx_persons_parent ON persons(parent_id);
CREATE INDEX IF NOT EXISTS idx_persons_key ON persons(name_key);
CREATE INDEX IF NOT EXISTS idx_persons_status ON persons(status, deleted_at);

CREATE TABLE IF NOT EXISTS codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    holder_name TEXT NOT NULL,
    holder_phone TEXT,
    note TEXT,
    scope_person_id INTEGER,
    can_add INTEGER NOT NULL DEFAULT 1,
    can_edit INTEGER NOT NULL DEFAULT 1,
    can_delete INTEGER NOT NULL DEFAULT 0,
    can_approve INTEGER NOT NULL DEFAULT 0,
    max_additions INTEGER,
    expires_at TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    login_count INTEGER NOT NULL DEFAULT 0,
    last_used_at TEXT,
    last_used_ip TEXT,
    created_by INTEGER,
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    chain_json TEXT NOT NULL,
    sons_json TEXT,
    anchor_id INTEGER,
    anchor_index INTEGER,
    above_json TEXT,
    top_id INTEGER,
    self_person_id INTEGER,
    submitter_name TEXT,
    phone TEXT,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    code_id INTEGER,
    ip TEXT,
    user_agent TEXT,
    device TEXT,
    visitor_id TEXT,
    created_at TEXT,
    reviewed_by_label TEXT,
    reviewed_at TEXT,
    review_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_sub_status ON submissions(status);

CREATE TABLE IF NOT EXISTS suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id INTEGER,
    message TEXT NOT NULL,
    contact TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    ip TEXT,
    user_agent TEXT,
    created_at TEXT,
    reviewed_by_label TEXT,
    reviewed_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_type TEXT,
    actor_id INTEGER,
    actor_label TEXT,
    action TEXT NOT NULL,
    entity TEXT,
    entity_id INTEGER,
    summary TEXT,
    before_json TEXT,
    after_json TEXT,
    ip TEXT,
    user_agent TEXT,
    device TEXT,
    created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_type, actor_id);

CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor_id TEXT,
    ip TEXT,
    user_agent TEXT,
    device TEXT,
    os TEXT,
    browser TEXT,
    model TEXT,
    page TEXT,
    query TEXT,
    referrer TEXT,
    screen TEXT,
    lang TEXT,
    code_id INTEGER,
    admin_id INTEGER,
    is_new INTEGER NOT NULL DEFAULT 0,
    is_bot INTEGER NOT NULL DEFAULT 0,
    created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_visits_created ON visits(created_at);
CREATE INDEX IF NOT EXISTS idx_visits_visitor ON visits(visitor_id);

CREATE TABLE IF NOT EXISTS rate_limits (
    rkey TEXT PRIMARY KEY,
    hits INTEGER NOT NULL,
    window_start INTEGER NOT NULL
);
SQL);
    schema_migrate($pdo);
}

/** ترقية قواعد البيانات القديمة: إضافة الأعمدة الجديدة دون المساس بالبيانات */
function schema_migrate(PDO $pdo): void
{
    $add = [
        'persons' => ['floating' => 'INTEGER NOT NULL DEFAULT 0'],
        'submissions' => ['above_json' => 'TEXT', 'top_id' => 'INTEGER'],
    ];
    foreach ($add as $table => $cols) {
        $have = array_column($pdo->query("PRAGMA table_info($table)")->fetchAll(PDO::FETCH_ASSOC), 'name');
        foreach ($cols as $col => $type) {
            if (!in_array($col, $have, true)) {
                $pdo->exec("ALTER TABLE $table ADD COLUMN $col $type");
            }
        }
    }
}

function settings_defaults(): array
{
    return [
        'site_title'        => 'شجرة عشيرة الحلاف',
        'clan_name'         => 'عشيرة الحلاف',
        'hierarchy'         => json_encode([
            ['label' => 'القبيلة', 'value' => 'بني مخزوم'],
            ['label' => 'العشيرة', 'value' => 'الحلاف'],
            ['label' => 'الفخذ',   'value' => ''],
        ], JSON_UNESCAPED_UNICODE),
        'laqab'             => 'الحلفي، الحلافي',
        'tagline'           => 'سجلّ نسب العشيرة، من الجد الأكبر إلى أصغر حفيد',
        'about'             => 'هذه الشجرة سجلّ حيّ لأبناء العشيرة، يضيف فيه كل فرد اسمه ونسبه، ويتولى رؤساء البيوت والمشرفون التحقق منه حفاظاً على صحة الأنساب وصلة الأرحام.',
        'verse_1'           => 'يَا أَيُّهَا النَّاسُ إِنَّا خَلَقْنَاكُم مِّن ذَكَرٍ وَأُنثَىٰ وَجَعَلْنَاكُمْ شُعُوبًا وَقَبَائِلَ لِتَعَارَفُوا ۚ إِنَّ أَكْرَمَكُمْ عِندَ اللَّهِ أَتْقَاكُمْ',
        'verse_1_ref'       => 'سورة الحجرات: 13',
        'verse_2'           => 'وَاتَّقُوا اللَّهَ الَّذِي تَسَاءَلُونَ بِهِ وَالْأَرْحَامَ ۚ إِنَّ اللَّهَ كَانَ عَلَيْكُمْ رَقِيبًا',
        'verse_2_ref'       => 'سورة النساء: 1',
        'registration_mode' => 'review',   // review | codes | closed
        'require_phone'     => '0',
        'code_auto_approve' => '1',
        'blocked_words'     => '',
        'submissions_per_hour' => '6',
        'show_females'      => '0',
        'show_years'        => '1',
        'show_added_by'     => '0',
        'default_view'      => 'down',     // down | organic
        'default_color_mode'=> 'generation', // generation | classic | house
        // ألوان الأجيال بالترتيب: الجيل الأول، الثاني، ... (تتكرر إن زادت الأجيال)
        'gen_colors'        => json_encode(['#8fd3df', '#c0392b', '#ffffff', '#f4e7c5', '#f2b705', '#e67e22', '#8e5ea2', '#2e86c1', '#d35400', '#16a085'], JSON_UNESCAPED_UNICODE),
        'color_trunk'       => '#bfe6dc',  // ألواح الأجداد على الجذع
        'color_root'        => '#f3e6c4',  // الجد الجامع
        'color_head'        => '#e2b714',  // رؤوس البيوت (النمط الكلاسيكي)
        'color_son'         => '#ffffff',  // الأبناء (النمط الكلاسيكي)
        'color_leaf'        => '#2f6b1f',  // الأوراق: الجيل الأخير
        'color_branch'      => '#3b2314',  // الأغصان
        'poster_title'      => '',
        'poster_credits'    => '',
        'contact_phone'     => '',
        'contact_note'      => 'للاستفسار أو تصحيح الأنساب تواصل مع إدارة الشجرة.',
        'track_visits'      => '1',
        'anonymize_ip'      => '0',
        'timezone'          => 'Asia/Baghdad',
    ];
}
