/* icons.jsx — simple line icons (Lucide/Tabler style), stroke = currentColor */
const ICON_PATHS = {
  // ui
  plus:      'M12 5v14M5 12h14',
  search:    'M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0M21 21l-4.3-4.3',
  barcode:   'M4 6v12M7 6v12M10 6v8M13 6v12M16 6v8M19 6v12',
  chevDown:  'M6 9l6 6 6-6',
  chevRight: 'M9 6l6 6-6 6',
  x:         'M18 6 6 18M6 6l12 12',
  check:     'M5 12l5 5L20 7',
  arrowL:    'M19 12H5M11 18l-6-6 6-6',
  arrowR:    'M5 12h14M13 6l6 6-6 6',
  grid:      'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  list:      'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  lock:      'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3',
  edit:      'M4 20h4l11-11a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5 4 20z',
  settings:  'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.3 1a7 7 0 0 0-1.7-1l-.4-2.5h-4l-.4 2.5a7 7 0 0 0-1.7 1l-2.3-1-2 3.4 2 1.6a7 7 0 0 0 0 2l-2 1.6 2 3.4 2.3-1a7 7 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.6c.1-.3.1-.7.1-1z',
  sparkle:   'M12 3l1.8 4.9L18.7 9l-4.9 1.8L12 15l-1.8-4.2L5.3 9l4.9-1.1zM18 14l.8 2.2 2.2.8-2.2.8L18 20l-.8-2.2-2.2-.8 2.2-.8z',
  restart:   'M4 12a8 8 0 1 0 2.3-5.6M4 4v3.5h3.5',
  layers:    'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5',
  // space types
  fridge:    'M6 3h12v18H6zM6 10h12M9 6v2M9 13v3',
  snow:      'M12 3v18M5 7l14 10M19 7L5 17M12 3l-2.5 2M12 3l2.5 2M12 21l-2.5-2M12 21l2.5-2',
  wine:      'M8 3h8l-1 7a3 3 0 0 1-6 0L8 3zM12 13v6M9 21h6',
  cabinet:   'M5 3h14v18H5zM5 12h14M10 7v2M10 15v2',
  dots:      'M5 6h14M5 12h14M5 18h14',
  spark2:    'M9 3l1.5 5L15 9l-4.5 1.5L9 15l-1.5-4.5L3 9l4.5-1z',
  // item categories
  bottle:    'M10 2h4v3l1 2v13a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V7l1-2V2zM9 12h6',
  egg:       'M12 3c3 0 6 5 6 9a6 6 0 0 1-12 0c0-4 3-9 6-9z',
  bowl:      'M3 11h18a8 8 0 0 1-8 8h-2a8 8 0 0 1-8-8zM7 11a5 5 0 0 1 10 0',
  box:       'M3 8l9-5 9 5v8l-9 5-9-5V8zM3 8l9 5 9-5M12 13v8',
  leaf:      'M5 19c0-8 6-14 14-14 0 8-6 14-14 14zM5 19c2-4 5-7 9-9',
  cheese:    'M3 14l11-7 7 4v3H3zM3 14v3h18M7 13v2M12 11v2',
  milk:      'M9 3h6v3l2 3v12H7V9l2-3V3zM7 11h10',
  jar:       'M7 8h10v11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V8zM8 8V5h8v3M9 3h6',
  meat:      'M14 4a5 5 0 0 1 4 8l-6 6a4 4 0 0 1-6-6l4-4M8 16l-2 2',
  package:   'M3 8l9-5 9 5v8l-9 5-9-5V8zM3 8l9 5 9-5',
  // editor tools
  cursor:    'M6 3l14 7-6.2 1.7L11.5 18 6 3z',
  square:    'M4 5h16v14H4z',
  drawer:    'M4 5h16v6H4zM4 13h16v6H4zM10 8h4M10 16h4',
  floorI:    'M3 16h18M6 16l1.6-7h8.8l1.6 7',
  trash:     'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  columns:   'M4 4h7v16H4zM13 4h7v16h-7z',
};

function Icon({ name, size = 20, stroke = 2, fill = false, style, className }) {
  const d = ICON_PATHS[name] || ICON_PATHS.package;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
         style={style} className={className} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

// keyword -> category icon (no emoji, simple shapes)
function itemIcon(name = '') {
  const n = name.toLowerCase();
  if (/milk/.test(n)) return 'milk';
  if (/juice|water|soda|wine|beer|drink|cola/.test(n)) return 'bottle';
  if (/egg/.test(n)) return 'egg';
  if (/leftover|soup|curry|pasta|stew|rice|sauce|yogurt|yoghurt/.test(n)) return 'bowl';
  if (/cheese|cheddar|butter/.test(n)) return 'cheese';
  if (/jam|pickle|preserve|honey|ketchup|mustard|mayo/.test(n)) return 'jar';
  if (/carrot|lettuce|spinach|veg|salad|herb|greens|kale|broccoli/.test(n)) return 'leaf';
  if (/chicken|beef|pork|meat|fish|ham|bacon|steak|sausage/.test(n)) return 'meat';
  return 'package';
}

Object.assign(window, { Icon, itemIcon, ICON_PATHS });
