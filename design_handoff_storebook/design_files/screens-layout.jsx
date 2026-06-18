/* screens-layout.jsx — realistic layout.
   A unit (drawn rectangle) has LEVELS (stacked shelves, level 1 = top).
   Each level holds a flexible list of items, optionally split front/back (depth).
   - Shelves view : walls grouped by facing (left·front·right·back), each unit shows its levels.
   - Top view     : a faithful mini-map of the drawing — units at the positions/sizes you drew. */
const { useState: useStateLay } = React;

const itemsOf = (space, zoneId, depth, level) => space.items
  .filter(it => it.zoneId === zoneId
    && (depth ? (it.depth || 'front') === depth : true)
    && (level ? (it.level || 1) === level : true))
  .sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0));

/* ---- a single flowing item ---- */
function ItemChip({ item, selId, onSelect, size = 'md' }) {
  const status = expiryStatus(item.expiry);
  const warn = status === 'soon' || status === 'today' || status === 'gone';
  return (
    <button className={'ichip ' + size + (item.id === selId ? ' sel' : '') + (warn ? ' warn' : '')}
            onClick={() => onSelect(item.id)} title={item.name + (item.quantity > 1 ? ` ×${item.quantity}` : '')}>
      <Icon name={itemIcon(item.name)} size={size === 'sm' ? 13 : 15} />
      <span className="ic-name">{item.name}</span>
      {item.quantity > 1 && <span className="ic-q">×{item.quantity}</span>}
      {warn && <span className="ic-dot" />}
    </button>
  );
}

function AddChip({ onClick, label = 'Add' }) {
  return <button className="add-chip" onClick={onClick} title="Add an item here"><Icon name="plus" size={14} />{label}</button>;
}

/* ============================================================
   Shelves view (elevation) — open the door and look in
   ============================================================ */
function ShelfUnit({ zone, space, type, selId, onSelect, onAddItem }) {
  const [depth, setDepth] = useStateLay('front');
  if (zone.floor) return null;
  const levels = Math.max(1, zone.levels || 1);
  const active = zone.hasDepth ? depth : null;
  const total = itemsOf(space, zone.id).length;

  return (
    <div className={'shelf z-' + zone.color}>
      <div className="shelf-label">
        <div className="shelf-name">{zoneName(zone, type)}</div>
        <div className="shelf-meta">
          {total} {total === 1 ? 'item' : 'items'}
          {levels > 1 ? ` · ${levels} levels` : ''}{zone.kind === 'drawer' ? ' · drawer' : ''}
        </div>
        {zone.hasDepth && (
          <div className="depth-tabs compact">
            <button className={'depth-tab' + (depth === 'front' ? ' on' : '')} onClick={() => setDepth('front')}>Front</button>
            <button className={'depth-tab' + (depth === 'back' ? ' on' : '')} onClick={() => setDepth('back')}>Back</button>
          </div>
        )}
      </div>
      <div className="levels-stack">
        {Array.from({ length: levels }).map((_, i) => {
          const lvl = i + 1;
          const items = itemsOf(space, zone.id, active, lvl);
          return (
            <div className={'level-row' + (levels > 1 ? ' tiered' : '')} key={lvl}>
              {levels > 1 && <div className="level-tag" title={`Level ${lvl}`}>L{lvl}</div>}
              <div className="shelf-deck">
                {items.length === 0 && <span className="shelf-empty">Empty{zone.hasDepth ? ` (${depth})` : ''}</span>}
                {items.map(it => <ItemChip key={it.id} item={it} selId={selId} onSelect={onSelect} />)}
                <AddChip onClick={() => onAddItem(zone, active || 'front', lvl)} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FloorStrip({ space, type, selId, onSelect, onAddItem }) {
  const floors = space.zones.filter(z => z.floor);
  if (floors.length === 0) return null;
  return (
    <div className="floor-strip">
      {floors.map(z => {
        const items = itemsOf(space, z.id);
        return (
          <div className={'floor-band z-' + z.color} key={z.id}>
            <div className="fb-label"><Icon name="floorI" size={14} /><span>{zoneName(z, type)}</span><span className="fb-meta">on the ground · {items.length}</span></div>
            <div className="shelf-deck">
              {items.length === 0 && <span className="shelf-empty">Nothing on the floor</span>}
              {items.map(it => <ItemChip key={it.id} item={it} selId={selId} onSelect={onSelect} />)}
              <AddChip onClick={() => onAddItem(z, 'front', 1)} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ShelfElevation({ space, selId, onSelect, onAddItem }) {
  const type = space.type;
  const wallZones = space.zones.filter(z => !z.floor);

  const order = (a, b) => {
    if (space.canvasMode === 'freeform') {
      const ay = a.rect ? a.rect.y : 1e9, by = b.rect ? b.rect.y : 1e9;
      return (ay - by) || ((a.rect?.x ?? 0) - (b.rect?.x ?? 0));
    }
    return ((a.column || 0) - (b.column || 0)) || (a.position - b.position);
  };

  const labelOf = id => (FACINGS.find(f => f[0] === id) || [id, id])[1];
  const walls = WALL_ORDER
    .map(id => ({ id, label: labelOf(id), zones: wallZones.filter(z => (z.facing || 'front') === id).sort(order) }))
    .filter(w => w.zones.length > 0);
  const multiWall = walls.length > 1;

  return (
    <div className="elevation-wrap">
      {wallZones.length === 0 && <div className="faint" style={{ fontSize: 13, padding: 16 }}>No shelves yet — draw some in “Edit layout”.</div>}
      <div className={'walls' + (multiWall ? ' spatial' : '')}>
        {walls.map(w => (
          <div className={'wall w-' + w.id} key={w.id}>
            {multiWall && <div className="wall-head"><Icon name="columns" size={13} />{w.label} wall<span className="wall-ct">{w.zones.length} {w.zones.length === 1 ? 'unit' : 'units'}</span></div>}
            <div className="wall-stack">
              {w.zones.map(z => <ShelfUnit key={z.id} zone={z} space={space} type={type} selId={selId} onSelect={onSelect} onAddItem={onAddItem} />)}
            </div>
          </div>
        ))}
      </div>
      <FloorStrip space={space} type={type} selId={selId} onSelect={onSelect} onAddItem={onAddItem} />
    </div>
  );
}

/* ============================================================
   Top view — a faithful mini-map of the drawing
   ============================================================ */
function MapZone({ zone, space, type, selId, onSelect, onAddItem, fitHeight }) {
  const levels = Math.max(1, zone.levels || 1);
  const total = itemsOf(space, zone.id).length;

  if (zone.floor) {
    const items = itemsOf(space, zone.id);
    return (
      <div className={'map-zone floor z-' + zone.color} style={fitHeight ? { height: '100%' } : null}>
        <div className="mz-head"><span className="sw"></span><span className="nm">{zoneName(zone, type)}</span><span className="ct">ground · {total}</span></div>
        <div className="mz-body">
          <div className="mz-cluster">
            {items.length === 0 ? <span className="shelf-empty">Empty</span> : items.map(it => <ItemChip key={it.id} item={it} selId={selId} onSelect={onSelect} size="sm" />)}
            <AddChip onClick={() => onAddItem(zone, 'front', 1)} label="" />
          </div>
        </div>
      </div>
    );
  }

  const bands = zone.hasDepth ? ['back', 'front'] : [null];
  return (
    <div className={'map-zone z-' + zone.color} style={fitHeight ? { height: '100%' } : null}>
      <div className="mz-head">
        <span className="sw"></span><span className="nm">{zoneName(zone, type)}</span>
        <span className="ct">{levels > 1 ? `${levels}L · ` : ''}{total}</span>
      </div>
      <div className="mz-body">
        {bands.map(b => {
          const items = itemsOf(space, zone.id, b);  // aggregated across levels (levels stack vertically — invisible from top)
          return (
            <div className={'mz-band' + (b ? ' labeled' : '')} key={b || 'all'}>
              {b && <span className="band-tag">{b === 'back' ? 'Back' : 'Front'}</span>}
              <div className="mz-cluster">
                {items.length === 0 ? <span className="shelf-empty">Empty</span> : items.map(it => <ItemChip key={it.id} item={it} selId={selId} onSelect={onSelect} size="sm" />)}
                <AddChip onClick={() => onAddItem(zone, b || 'front', 1)} label="" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FreeformTop({ space, selId, onSelect, onAddItem }) {
  const type = space.type;
  const positioned = space.zones.filter(z => z.rect);
  // normalize so the drawn bounding box starts at a small margin (no left-clipping, no huge offsets)
  const minX = positioned.length ? Math.min(...positioned.map(z => z.rect.x)) : 0;
  const minY = positioned.length ? Math.min(...positioned.map(z => z.rect.y)) : 0;
  const ox = 24 - minX, oy = 24 - minY;
  const w = Math.max(360, ...positioned.map(z => z.rect.x + ox + z.rect.w)) + 24;
  const h = Math.max(240, ...positioned.map(z => z.rect.y + oy + z.rect.h)) + 24;
  return (
    <div className="free-view-scroll">
      <div className="free-view top-map" style={{ width: w, height: h }}>
        {positioned.length === 0 && (
          <div className="empty" style={{ position: 'absolute', inset: 24 }}>
            <div className="big">No zones drawn yet</div>
            <div>Hit “Edit layout” to draw shelves on the canvas.</div>
          </div>
        )}
        {positioned.map(z => (
          <div key={z.id} className="free-zone" style={{ left: z.rect.x + ox, top: z.rect.y + oy, width: z.rect.w, height: z.rect.h }}>
            <MapZone zone={z} space={space} type={type} selId={selId} onSelect={onSelect} onAddItem={onAddItem} fitHeight />
          </div>
        ))}
      </div>
    </div>
  );
}

function ColumnsTop({ space, selId, onSelect, onAddItem }) {
  const n = space.layoutColumns || 1;
  const type = space.type;
  return (
    <div className={'map-cols cols-' + n}>
      {Array.from({ length: n }).map((_, c) => (
        <div className="map-col" key={c}>
          {n > 1 && <div className="col-header"><Icon name="columns" size={13} />{(space.columnLabels && space.columnLabels[c]) || ('Column ' + (c + 1))}</div>}
          {space.zones.filter(z => (z.column || 0) === c).length === 0 && <div className="faint" style={{ fontSize: 13, padding: '8px 2px' }}>No zones here yet.</div>}
          {space.zones.filter(z => (z.column || 0) === c).map(z => (
            <MapZone key={z.id} zone={z} space={space} type={type} selId={selId} onSelect={onSelect} onAddItem={onAddItem} />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   Detail bar — floating bottom notification (doesn't shrink content)
   ============================================================ */
function DetailBar({ item, zone, type, onRemove, onClose }) {
  const loc = zone ? zoneName(zone, type)
    + (zone.levels > 1 ? ` · level ${item.level || 1}` : '')
    + (zone.hasDepth ? ` · ${item.depth || 'front'}` : '') : '—';
  const status = item.expiry ? expiryStatus(item.expiry) : null;
  return (
    <div className={'detail-bar z-' + (zone?.color || 'gray')}>
      <span className="db-ico"><Icon name={itemIcon(item.name)} size={20} /></span>
      <div className="db-main">
        <div className="db-name">{item.name}{item.quantity > 1 && <span className="db-q">×{item.quantity}</span>}</div>
        <div className="db-loc">{loc}</div>
      </div>
      {item.expiry && <span className={'expiry ' + status}><span className="d"></span>{expiryLabel(item.expiry)}</span>}
      <span className="pro-badge"><Icon name="lock" size={11} />Photo</span>
      <button className="btn subtle" style={{ fontSize: 13.5, padding: '9px 13px' }}><Icon name="edit" size={15} />Edit</button>
      <button className="iconbtn" onClick={() => { onRemove(item.id); }} aria-label="Remove"><Icon name="trash" size={16} /></button>
      <button className="iconbtn db-close" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
    </div>
  );
}

/* ============================================================
   Shell
   ============================================================ */
function LayoutScreen({ space, selId, onSelect, onRemove, onEdit, onAddItem }) {
  const type = space.type;
  const [lstyle, setLstyle] = useStateLay('shelves');
  const selItem = space.items.find(it => it.id === selId) || null;
  const selZone = selItem ? space.zones.find(z => z.id === selItem.zoneId) : null;
  const free = space.canvasMode === 'freeform';

  return (
    <div className="content wide">
      <div className="section-head">
        <span className="t">Layout</span>
        <span className="pill" style={{ marginLeft: 2 }}>
          {free ? 'free canvas' : (space.layoutColumns > 1 ? space.layoutColumns + ' columns' : 'single column')} · {space.items.length} items
        </span>
        <span className="spacer"></span>
        <div className="seg" style={{ marginRight: 2 }} title="How to view the contents">
          <button className={lstyle === 'shelves' ? 'on' : ''} onClick={() => setLstyle('shelves')}><Icon name="list" size={14} />Shelves</button>
          <button className={lstyle === 'top' ? 'on' : ''} onClick={() => setLstyle('top')}><Icon name="grid" size={14} />Top view</button>
        </div>
        <button className="btn subtle" style={{ fontSize: 13.5, padding: '9px 13px' }} onClick={onEdit}><Icon name="edit" size={16} />Edit layout</button>
      </div>
      {lstyle === 'shelves'
        ? <div className="view-note"><Icon name="list" size={13} />Open the door and look in — units grouped by wall, each shelf level stacked top to bottom. Items flow; no fixed slot count.</div>
        : <div className="view-note"><Icon name="grid" size={13} />Looking down — the same map you drew. Levels stack vertically (hidden from the top); depth shows as front / back bands.</div>}
      <div className="layout-wrap">
        <div className="canvas">
          {lstyle === 'shelves'
            ? <ShelfElevation space={space} selId={selId} onSelect={onSelect} onAddItem={onAddItem} />
            : free
              ? <FreeformTop space={space} selId={selId} onSelect={onSelect} onAddItem={onAddItem} />
              : <ColumnsTop space={space} selId={selId} onSelect={onSelect} onAddItem={onAddItem} />}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { LayoutScreen, DetailBar, ShelfElevation, MapZone });
