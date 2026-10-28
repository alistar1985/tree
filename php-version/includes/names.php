<?php
/**
 * أدوات الأسماء العربية: التوحيد الإملائي، المفاتيح، التشابه، والتحقق.
 */

/** توحيد الكتابة: حذف التشكيل والتطويل وتوحيد الألف والياء والتاء المربوطة */
function ar_normalize(string $s): string
{
    $s = preg_replace('/[\x{064B}-\x{065F}\x{0670}\x{0640}\x{06D6}-\x{06ED}]/u', '', $s);
    $s = strtr($s, [
        'أ' => 'ا', 'إ' => 'ا', 'آ' => 'ا', 'ٱ' => 'ا',
        'ى' => 'ي', 'ی' => 'ي', 'ئ' => 'ي', 'ة' => 'ه', 'ؤ' => 'و', 'ک' => 'ك', 'ء' => '',
    ]);
    $s = preg_replace('/\s+/u', ' ', $s);
    return trim($s);
}

/** مفتاح المقارنة: بدون مسافات (عبدالله = عبد الله) */
function name_key(string $s): string
{
    return str_replace(' ', '', ar_normalize($s));
}

/** تنظيف الاسم للعرض: إزالة الرموز الغريبة والمسافات الزائدة مع إبقاء الكتابة كما أدخلت */
function name_clean(string $s): string
{
    if (!mb_check_encoding($s, 'UTF-8')) {
        return '';
    }
    $s = preg_replace('/\x{0640}/u', '', $s);
    $s = preg_replace('/[^\p{Arabic}\s]/u', ' ', $s);
    $s = preg_replace('/\s+/u', ' ', $s);
    return trim($s);
}

/** درجة تشابه بين مفتاحين: 1 تطابق، 0.9 اختلاف "ال"، 0.75 خطأ حرف واحد، 0 مختلف */
function name_sim(string $a, string $b): float
{
    if ($a === $b) {
        return 1.0;
    }
    $a2 = preg_replace('/^ال/u', '', $a);
    $b2 = preg_replace('/^ال/u', '', $b);
    if ($a2 === $b2) {
        return 0.9;
    }
    // الأحرف العربية بايتان في UTF-8؛ فرق ≤ 2 بايت ≈ حرف واحد
    $la = strlen($a2);
    $lb = strlen($b2);
    if (min($la, $lb) >= 10 && abs($la - $lb) <= 2 && levenshtein($a2, $b2) <= 2) {
        return 0.75;
    }
    return 0.0;
}

/** التحقق من اسم مفرد — يعيد رسالة خطأ أو null */
function name_error(string $name): ?string
{
    $len = mb_strlen($name);
    if ($len < 2) {
        return 'الاسم «' . $name . '» قصير جداً';
    }
    if ($len > 30) {
        return 'الاسم «' . mb_substr($name, 0, 20) . '…» طويل جداً';
    }
    if (!preg_match('/^[\p{Arabic}\s]+$/u', $name)) {
        return 'يُقبل الاسم بالحروف العربية فقط';
    }
    $blocked = preg_split('/[،,\n]+/u', (string)setting('blocked_words'));
    $key = name_key($name);
    foreach ($blocked as $w) {
        $w = name_key(trim($w));
        if ($w !== '' && mb_strpos($key, $w) !== false) {
            return 'الاسم «' . $name . '» غير مقبول';
        }
    }
    return null;
}

/** تنظيف قائمة أسماء والتحقق منها؛ يرمي استثناءً برسالة عربية عند الخطأ */
function clean_name_list($list, int $max, string $label = 'الأسماء'): array
{
    if (!is_array($list)) {
        return [];
    }
    $out = [];
    foreach ($list as $n) {
        $n = name_clean((string)$n);
        if ($n === '') {
            continue;
        }
        if ($err = name_error($n)) {
            throw new InvalidArgumentException($err);
        }
        $out[] = $n;
    }
    if (count($out) > $max) {
        throw new InvalidArgumentException('عدد ' . $label . ' أكبر من المسموح (' . $max . ')');
    }
    return $out;
}
