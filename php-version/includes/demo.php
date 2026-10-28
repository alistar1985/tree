<?php
/**
 * بيانات تجريبية لعرض إمكانات الشجرة (يمكن حذفها من الإعدادات).
 * الصيغة: مسافتان لكل جيل، و «*» تعني رأس بيت يتبعها اسم البيت.
 */

const DEMO_TREE = <<<TXT
سلمان
  عبد الله
    حسين *بيت حسين
      علي
        كاظم
          جاسم
            حيدر
            مرتضى
          هاشم
            عباس
            كرار
            سجاد
        عبد الحسين
          ستار
            مصطفى
            منتظر
          جبار
            أمير
      حمزة
        صالح *بيت صالح الحمزة
          رحيم
            أحمد
            ياسر
              يوسف
          كريم
            زيد
          عبد الكريم
            قاسم
            طالب
        نوري
          رعد
          رياض
            علاء
    موسى *بيت موسى
      محمد *بيت محمد الموسى
        جعفر
          عبد الحليم
          مال الله
          عبد الأمير
            حسن
            حسين
        مهدي
          سعد
            أمير
            علاء
          فاضل
            ليث
            زين العابدين
        صادق
          باقر
          جواد
            رضا
            هادي
      عيسى
        إبراهيم
          خليل
            محمد
            سلام
          داود
        يعقوب
          يوسف
          سليمان
            عادل
            ضياء
    حمد *بيت حمد
      ناصر
        خالد
          وليد
          ماجد
        سالم
          فراس
          أيمن
      غانم
        فرحان
          شاكر
          حامد
            عدنان
            لؤي
        عودة
          خضير
          جبر
      سلمان
        نزار
        تحسين
    طاهر
      عبد الرزاق
        مازن
        عمار
      عبد الجبار
        هيثم
          سيف
TXT;

function demo_seed(int $rootId, array $actor): int
{
    $stack = [-1 => $rootId];
    $count = 0;
    foreach (preg_split('/\R/u', DEMO_TREE) as $line) {
        if (trim($line) === '') continue;
        $depth = intdiv(strlen($line) - strlen(ltrim($line, ' ')), 2);
        $text = trim($line);
        $house = null;
        if (strpos($text, '*') !== false) {
            [$text, $house] = array_map('trim', explode('*', $text, 2));
        }
        $fields = ['name' => $text];
        if ($house) {
            $fields['is_head'] = 1;
            $fields['house_name'] = $house;
        }
        $id = person_insert($stack[$depth - 1], $fields, $actor);
        $stack[$depth] = $id;
        $count++;
    }
    setting_set('demo_loaded', '1');
    return $count;
}
