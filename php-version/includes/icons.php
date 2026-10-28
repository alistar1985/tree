<?php
/**
 * أيقونات SVG خطية موحّدة — تُطبع مرة واحدة كـ sprite وتُستخدم عبر <use>.
 */

const ICONS = [
    'home'      => '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
    'dashboard' => '<rect x="3" y="3" width="8" height="10" rx="1.5"/><rect x="13" y="3" width="8" height="6" rx="1.5"/><rect x="13" y="11" width="8" height="10" rx="1.5"/><rect x="3" y="15" width="8" height="6" rx="1.5"/>',
    'tree'      => '<circle cx="12" cy="4.5" r="2.5"/><circle cx="5" cy="19.5" r="2.5"/><circle cx="12" cy="19.5" r="2.5"/><circle cx="19" cy="19.5" r="2.5"/><path d="M12 7v10M12 12H5v5M12 12h7v5"/>',
    'leaf'      => '<path d="M5 20c0-8.5 5-14.5 15-16-1 10.5-6.5 16-15 16z"/><path d="M5 20 13.5 11.5"/>',
    'users'     => '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18 14.2c2.2.6 3.5 2.6 3.5 5.8"/>',
    'user'      => '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
    'user-plus' => '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M19 8v6M16 11h6"/>',
    'house'     => '<path d="M3 11 12 4l9 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/><path d="M16 6V3.5h2.5V8"/>',
    'key'       => '<circle cx="8" cy="15" r="4"/><path d="M10.8 12.2 20 3M17 6l3 3M14.5 8.5l2 2"/>',
    'inbox'     => '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.5 5h13L21 13v6H3v-6z"/>',
    'history'   => '<path d="M3 12a9 9 0 1 0 2.8-6.5L3 8"/><path d="M3 3v5h5"/><path d="M12 7.5V12l3.5 2"/>',
    'eye'       => '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    'sliders'   => '<path d="M4 6h9M18 6h2M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15.5" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    'shield'    => '<path d="M12 3 4.5 6v6c0 4.4 3.2 8.2 7.5 9 4.3-.8 7.5-4.6 7.5-9V6z"/><path d="m9 12 2 2 4-4"/>',
    'plus'      => '<path d="M12 5v14M5 12h14"/>',
    'edit'      => '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    'trash'     => '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    'move'      => '<path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
    'merge'     => '<circle cx="6" cy="5.5" r="2.5"/><circle cx="6" cy="18.5" r="2.5"/><circle cx="18" cy="12" r="2.5"/><path d="M6 8v8M8 7c1.5 3 4 5 7.5 5"/>',
    'check'     => '<path d="m5 12.5 4.5 4.5L19 7"/>',
    'x'         => '<path d="M6 6l12 12M18 6 6 18"/>',
    'search'    => '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    'logout'    => '<path d="M14 4h5v16h-5"/><path d="M9.5 8 5.5 12l4 4M5.5 12H15"/>',
    'download'  => '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    'upload'    => '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
    'chart'     => '<path d="M3 21h18"/><rect x="5" y="11" width="3" height="7" rx="1"/><rect x="10.5" y="5" width="3" height="13" rx="1"/><rect x="16" y="13" width="3" height="5" rx="1"/>',
    'clock'     => '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    'mobile'    => '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>',
    'desktop'   => '<rect x="2.5" y="4" width="19" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>',
    'tablet'    => '<rect x="4" y="2.5" width="16" height="19" rx="2"/><path d="M11 18.5h2"/>',
    'bot'       => '<rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 4v4M9 13v1M15 13v1M9 17h6"/>',
    'copy'      => '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    'whatsapp'  => '<path d="M4 20.5l1.3-4.2A8.5 8.5 0 1 1 8.4 19.3z"/><path d="M9 8.5c-.3 2.9 2.6 6.5 6.3 6.8l1-1.6-2.1-1-1 .9c-1-.4-1.9-1.3-2.4-2.4l.9-1-.9-2.2z"/>',
    'sun'       => '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    'moon'      => '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    'menu'      => '<path d="M4 6h16M4 12h16M4 18h16"/>',
    'chev-l'    => '<path d="m15 6-6 6 6 6"/>',
    'chev-r'    => '<path d="m9 6 6 6-6 6"/>',
    'chev-d'    => '<path d="m6 9 6 6 6-6"/>',
    'crown'     => '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>',
    'alert'     => '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.5"/>',
    'info'      => '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.5"/>',
    'refresh'   => '<path d="M20 11a8 8 0 0 0-14.6-4.4L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.6 4.4L20 16"/><path d="M20 21v-5h-5"/>',
    'undo'      => '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    'external'  => '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    'zoom-in'   => '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M8 11h6M11 8v6"/>',
    'zoom-out'  => '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M8 11h6"/>',
    'fit'       => '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    'target'    => '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    'image'     => '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5L5 20"/>',
    'layers'    => '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    'palette'   => '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-1-.8-1.3-.8-2.2 0-.9.7-1.6 1.6-1.6H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="14.5" cy="7" r="1"/>',
    'share'     => '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/>',
    'lock'      => '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    'globe'     => '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
    'sparkles'  => '<path d="M11 3l1.8 4.7 4.7 1.8-4.7 1.8L11 16l-1.8-4.7L4.5 9.5l4.7-1.8z"/><path d="M18.5 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
    'link'      => '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    'arrow-up'  => '<path d="M12 19V5M6 11l6-6 6 6"/>',
    'arrow-r'   => '<path d="M5 12h14M13 6l6 6-6 6"/>',
    'arrow-l'   => '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    'database'  => '<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    'print'     => '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
    'filter'    => '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
    'calendar'  => '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    'phone'     => '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
    'expand'    => '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
    'branch'    => '<circle cx="6" cy="5" r="2.5"/><circle cx="18" cy="7" r="2.5"/><circle cx="6" cy="19" r="2.5"/><path d="M6 7.5v9M18 9.5c0 4-5 4.5-10.5 8"/>',
];

function icon(string $name, string $class = ''): string
{
    return '<svg class="ic' . ($class ? ' ' . e($class) : '') . '" aria-hidden="true"><use href="#i-' . e($name) . '"/></svg>';
}

function icon_sprite(): string
{
    $out = '<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">';
    foreach (ICONS as $name => $paths) {
        $out .= '<symbol id="i-' . $name . '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' . $paths . '</symbol>';
    }
    return $out . '</svg>';
}

/** شعار الموقع: شجرة داخل دائرة مزخرفة */
function logo_svg(int $size = 40): string
{
    return '<svg class="logo" width="' . $size . '" height="' . $size . '" viewBox="0 0 64 64" aria-hidden="true">
  <circle cx="32" cy="32" r="30" fill="var(--logo-bg, #2f5d1e)"/>
  <circle cx="32" cy="32" r="26.5" fill="none" stroke="var(--gold, #d9b23a)" stroke-width="1.4" stroke-dasharray="2 2.6"/>
  <path d="M30 52c1-6 1-11 0-17-3-3-8-4-11-8m11 8c3-4 8-6 12-9m-12 1c1-4 0-8-2-12" fill="none" stroke="#5a3a22" stroke-width="3.4" stroke-linecap="round"/>
  <path d="M33.6 52c-.6-5-.4-10 .6-15" fill="none" stroke="#5a3a22" stroke-width="3.4" stroke-linecap="round"/>
  <g fill="#9bd04f"><ellipse cx="18" cy="25" rx="5" ry="3.2" transform="rotate(-30 18 25)"/><ellipse cx="44" cy="24" rx="5" ry="3.2" transform="rotate(25 44 24)"/><ellipse cx="28" cy="13.5" rx="3.2" ry="5"/><ellipse cx="38" cy="16" rx="3" ry="4.6" transform="rotate(25 38 16)"/></g>
  <circle cx="31" cy="33" r="4.2" fill="var(--gold, #e2b714)" stroke="#fff6d5" stroke-width="1.2"/>
  <path d="M20 53h24" stroke="var(--gold, #d9b23a)" stroke-width="2" stroke-linecap="round"/>
</svg>';
}
