/* screens-list.jsx — the heart: smart add + item list, with grouped (accordion) mode */
const { useState: useStateL, useRef: useRefL } = React;

const SCAN_SAMPLES = [
  { name: 'Sparkling water', q: 6 }, { name: 'Greek yogurt', q: 4 },
  { name: 'Cola 0.5L', q: 1 }, { name: 'Hummus', q: 1 }, { name: 'Smoked salmon', q: 1 },
];

function Expiry({ iso }) {
  const status = expiryStatus(iso);
  if (!status) return null;
  const label = expiryLabel(iso);
  const text = status === 'gone' ? `expired ${label}`
    : status === 'today' ? 'expires today'
    : status === 'soon' ? `expires ${label}` : `expires ${label}`;
  return <span className={'expiry ' + status}><span className="d"></span>{text}</span>;
}

function ItemRow({ item, zone, type, onRemove, onQty, onSelect, entering, hideZone }) {
  const detail = [];
  if (zone) {
    if (zone.facing && zone.facing !== 'front') detail.push(`${zone.facing} wall`);
    if ((zone.levels || 1) > 1) detail.push(`L${item.level || 1}`);
    if (zone.hasDepth) detail.push(item.depth || 'front');
  }
  return (
    <div className={'item clickable z-' + (zone?.color || 'gray') + (entering ? ' entering' : '')}
         onClick={() => onSelect && onSelect(item.id)} role="button" tabIndex={0}>
      <span className="ico"><Icon name={itemIcon(item.name)} size={19} /></span>
      <div className="main">
        <div className="nm">{item.name}</div>
        <div className="sub">
          {zone && !hideZone && <span className="pill zone"><span className="dot"></span>{zoneName(zone, type)}</span>}
          {detail.length > 0 && <span className="loc-detail">{detail.join(' · ')}</span>}
          <Expiry iso={item.expiry} />
        </div>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <span className="qty">×{item.quantity}</span>
        <button className="promo-x iconbtn" style={{ width: 34, height: 34, border: 0, background: 'transparent', color: 'var(--text-3)' }}
                onClick={e => { e.stopPropagation(); onRemove(item.id); }} aria-label="Remove">
          <Icon name="x" size={16} />
        </button>
      </div>
    </div>
  );
}

function AddSmart({ onAdd, lastZoneName }) {
  const [val, setVal] = useStateL('');
  const ref = useRefL(null);
  const submit = () => { if (val.trim()) { onAdd(val); setVal(''); } };
  const scan = () => {
    const s = SCAN_SAMPLES[Math.floor(Math.random() * SCAN_SAMPLES.length)];
    const text = s.q > 1 ? `${s.name} x${s.q}` : s.name;
    setVal(text);
    if (ref.current) ref.current.focus();
  };
  return (
    <React.Fragment>
      <div className="addbar">
        <div className="addfield">
          <Icon name="plus" size={18} style={{ color: 'var(--text-3)' }} />
          <input ref={ref} value={val} onChange={e => setVal(e.target.value)}
                 onKeyDown={e => e.key === 'Enter' && submit()}
                 placeholder="Add item…  e.g. milk, top shelf" />
        </div>
        <button className="iconbtn" onClick={scan} aria-label="Scan barcode"><Icon name="barcode" size={20} /></button>
        <button className="btn primary" onClick={submit} disabled={!val.trim()} style={{ padding: '0 18px' }}>Add</button>
      </div>
      <div className="add-hint">
        <span>Try:</span>
        {['Butter, door', 'Eggs x12', 'Leftover soup, top shelf'].map(ex => (
          <span key={ex} className="chip" onClick={() => { onAdd(ex); }}>{ex}</span>
        ))}
        {lastZoneName && <span style={{ marginLeft: 'auto', color: 'var(--text-3)' }}>last added to <b style={{ color: 'var(--text-2)' }}>{lastZoneName}</b></span>}
      </div>
    </React.Fragment>
  );
}

function AddStructured({ space, onAddStructured }) {
  const [name, setName] = useStateL('');
  const [zoneId, setZoneId] = useStateL(space.zones[0]?.id || '');
  const [qty, setQty] = useStateL(1);
  const submit = () => { if (name.trim()) { onAddStructured(name, zoneId, qty); setName(''); setQty(1); } };
  return (
    <div className="add-structured">
      <div className="addfield">
        <Icon name="plus" size={18} style={{ color: 'var(--text-3)' }} />
        <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} placeholder="Item name" />
      </div>
      <select className="mini-select" value={zoneId} onChange={e => setZoneId(e.target.value)}>
        {space.zones.map(z => <option key={z.id} value={z.id}>{zoneName(z, space.type)}</option>)}
      </select>
      <select className="mini-select" style={{ minWidth: 80 }} value={qty} onChange={e => setQty(+e.target.value)}>
        {[1,2,3,4,6,12,24].map(n => <option key={n} value={n}>×{n}</option>)}
      </select>
      <button className="btn primary" onClick={submit} disabled={!name.trim()} style={{ padding: '0 20px' }}>Add</button>
    </div>
  );
}

function ListScreen(props) {
  const { space, onAdd, onAddStructured, onRemove, onSelect, onOpenLayout,
          grouped, setGrouped, showPromo, dismissPromo, addMode, justAddedId, lastZoneName } = props;
  const [search, setSearch] = useStateL('');
  const [collapsed, setCollapsed] = useStateL({});
  const type = space.type;

  const q = search.trim().toLowerCase();
  const filtered = space.items.filter(it => !q || it.name.toLowerCase().includes(q)
    || (it.tags || []).some(t => t.includes(q)));

  const zoneOf = id => space.zones.find(z => z.id === id);

  return (
    <div className="content">
      {addMode === 'structured'
        ? <AddStructured space={space} onAddStructured={onAddStructured} />
        : <AddSmart onAdd={onAdd} lastZoneName={lastZoneName} />}

      <div className="list-controls">
        <div className="searchfield">
          <Icon name="search" size={17} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${space.items.length} items…`} />
          {search && <button className="promo-x" style={{ border: 0, background: 'transparent', color: 'var(--text-3)', padding: 2 }} onClick={() => setSearch('')}><Icon name="x" size={15} /></button>}
        </div>
        <div className="seg">
          <button className={!grouped ? 'on' : ''} onClick={() => setGrouped(false)}><Icon name="list" size={15} />List</button>
          <button className={grouped ? 'on' : ''} onClick={() => setGrouped(true)}><Icon name="layers" size={15} />By zone</button>
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="empty">
          <div className="big">{space.items.length === 0 ? 'Nothing here yet' : 'No matches'}</div>
          <div>{space.items.length === 0 ? 'Add your first item above — try “milk, top shelf”.' : 'Try a different search.'}</div>
        </div>
      )}

      {filtered.length > 0 && !grouped && (
        <div className="items">
          {filtered.map(it => (
            <ItemRow key={it.id} item={it} zone={zoneOf(it.zoneId)} type={type}
                     onRemove={onRemove} onSelect={onSelect} entering={it.id === justAddedId} />
          ))}
        </div>
      )}

      {filtered.length > 0 && grouped && (
        <div>
          {space.zones.map(z => {
            const zitems = filtered.filter(it => it.zoneId === z.id);
            if (zitems.length === 0) return null;
            const open = !collapsed[z.id];
            const soon = zitems.filter(it => ['soon','today','gone'].includes(expiryStatus(it.expiry))).length;
            return (
              <div className={'group z-' + z.color} key={z.id}>
                <button className="group-head" aria-expanded={open} onClick={() => setCollapsed(c => ({ ...c, [z.id]: open }))}>
                  <span className="sw"></span>
                  <span className="nm">{zoneName(z, type)}</span>
                  <span className="count">· {zitems.length}{soon > 0 ? ` · ${soon} expiring` : ''}</span>
                  <span className="chev"><Icon name="chevRight" size={16} /></span>
                </button>
                {open && (
                  <div className="group-body">
                    {zitems.map(it => (
                      <ItemRow key={it.id} item={it} zone={z} type={type} onRemove={onRemove} onSelect={onSelect} entering={it.id === justAddedId} hideZone />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showPromo && type !== 'list' && (
        <div className="promo">
          <div className="pv">
            <div className="mini-grid z-blue">
              {Array.from({ length: 8 }).map((_, i) => (
                <i key={i} style={{ background: i % 3 === 0 ? 'color-mix(in oklch, var(--zc) 22%, transparent)' : 'transparent',
                                    borderStyle: i % 3 === 0 ? 'solid' : 'dashed' }}></i>
              ))}
            </div>
          </div>
          <div className="txt">
            <div className="t">Want to see this as a layout?</div>
            <div className="d">Arrange your {space.items.length} items spatially — shelf by shelf, slot by slot. Same data, nothing to re-enter.</div>
            <button className="btn outline" style={{ marginTop: 12, padding: '9px 14px', fontSize: 14 }} onClick={onOpenLayout}>
              <Icon name="grid" size={16} />Open layout view
            </button>
          </div>
          <button className="x" onClick={dismissPromo} aria-label="Dismiss"><Icon name="x" size={16} /></button>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { ListScreen, ItemRow, Expiry });
