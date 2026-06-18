/* app.jsx — store, router, product chrome, plans & paywalls.
   Phases: landing · auth · dashboard · create · app · pricing · account */
const { useState, useEffect, useRef } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "density": "airy",
  "corners": "soft",
  "addMode": "smart",
  "showLayoutPrompt": true,
  "dashStyle": "cards",
  "forcePlan": "auto"
}/*EDITMODE-END*/;

const LS_KEY = 'storebook_v2';
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const nameFromEmail = e => cap((e || 'you').split('@')[0].replace(/[._-]+/g, ' ').trim()) || 'You';

// bring any saved space up to the current model
function normalizeSpace(sp) {
  if (!sp) return sp;
  if (!sp.canvasMode) {
    sp.canvasMode = 'columns'; sp.layoutColumns = 1; sp.columnLabels = null;
    (sp.zones || []).forEach(z => { z.column = z.column ?? 0; z.rect = z.rect ?? null; z.kind = z.kind || (z.floor ? 'floor' : 'shelf'); });
    (sp.items || []).forEach(it => { it.depth = it.depth || 'front'; });
  }
  (sp.zones || []).forEach(z => { if (!z.facing) z.facing = 'front'; if (!z.levels) z.levels = 1; });
  (sp.items || []).forEach(it => { if (!it.level) it.level = 1; });
  return sp;
}

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const st = JSON.parse(raw);
      (st.spaces || []).forEach(normalizeSpace);
      return st;
    }
    // migrate single-space v1 demo → multi-space + account
    const old = localStorage.getItem('storebook_v1');
    if (old) {
      const o = JSON.parse(old);
      if (o && o.space) {
        return { user: { name: 'You', email: 'you@storebook.app', plan: 'free' },
                 phase: 'dashboard', spaces: [normalizeSpace(o.space)], currentId: null, syncOn: false };
      }
    }
    return null;
  } catch (e) { return null; }
}

// deep-clone a space with fresh ids
function cloneSpace(sp) {
  const id = uid('space');
  const zmap = {};
  const zones = sp.zones.map(z => { const nz = { ...z, id: uid('zone') }; zmap[z.id] = nz.id; return nz; });
  const items = sp.items.map(it => ({ ...it, id: uid('item'), zoneId: zmap[it.zoneId] || it.zoneId }));
  return { ...sp, id, name: sp.name + ' copy', zones, items };
}

/* ============================================================
   Product nav (inside the app surface, above dashboard/pricing/account)
   ============================================================ */
function AppNav({ user, plan, active, onHome, onPricing, onAccount }) {
  const initials = (user?.name || user?.email || '?').trim().slice(0, 1).toUpperCase();
  return (
    <div className="appnav">
      <button className="brand" onClick={onHome}><span className="mark"><Icon name="grid" size={14} /></span>storebook</button>
      <nav className="appnav-links">
        <button className={active === 'dashboard' ? 'on' : ''} onClick={onHome}>Spaces</button>
        <button className={active === 'pricing' ? 'on' : ''} onClick={onPricing}>Pricing</button>
      </nav>
      <span className="spacer"></span>
      <span className={'plan-pill ' + plan.id}>{plan.id === 'pro' && <Icon name="sparkle" size={12} />}{plan.name}</span>
      <button className="appnav-avatar" onClick={onAccount} aria-label="Account">{initials}</button>
    </div>
  );
}

// add-item-to-shelf modal
function AddSlotModal({ target, onConfirm, onCancel }) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  if (!target) return null;
  return (
    <div className="modal-back" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div className="col" style={{ gap: 2 }}>
            <div className="modal-title">Add to {target.zoneName}</div>
            {target.sub ? <div className="modal-sub">{target.sub}</div> : null}
          </div>
          <button className="iconbtn" style={{ width: 34, height: 34 }} onClick={onCancel}><Icon name="x" size={16} /></button>
        </div>
        <input className="name-field" autoFocus value={name} onChange={e => setName(e.target.value)}
               onKeyDown={e => e.key === 'Enter' && onConfirm(name, qty)} placeholder="Item name" style={{ fontSize: 15 }} />
        <div className="row" style={{ gap: 9, marginTop: 12 }}>
          <select className="mini-select" value={qty} onChange={e => setQty(+e.target.value)} style={{ height: 44 }}>
            {[1,2,3,4,6,12,24].map(n => <option key={n} value={n}>×{n}</option>)}
          </select>
          <button className="btn primary" style={{ flex: 1 }} disabled={!name.trim()} onClick={() => onConfirm(name, qty)}>Add item</button>
        </div>
      </div>
    </div>
  );
}

// full item-detail modal — photos gated behind Pro
function ItemModal({ item, zone, type, pro, onClose, onRemove, onQty, onPhoto }) {
  if (!item) return null;
  const status = item.expiry ? expiryStatus(item.expiry) : null;
  const expDate = item.expiry ? new Date(item.expiry).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : null;
  const addDate = item.dateAdded ? new Date(item.dateAdded).toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) : '—';
  const detail = [];
  if (zone) {
    if (zone.facing && zone.facing !== 'front') detail.push(`${zone.facing} wall`);
    if ((zone.levels || 1) > 1) detail.push(`level ${item.level || 1}`);
    if (zone.hasDepth) detail.push(item.depth || 'front');
  }
  return (
    <div className="modal-back" onClick={onClose}>
      <div className={'modal item-modal z-' + (zone?.color || 'gray')} onClick={e => e.stopPropagation()}>
        <button className="iconbtn modal-x" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
        <button className="im-photo" onClick={onPhoto} title={pro ? 'Add a photo' : 'Photos are a Pro feature'}>
          <span className="ph-label">{pro ? '[ add photo ]' : '[ photo ]'}</span>
          {pro
            ? <span className="im-photo-add"><Icon name="plus" size={13} />Add photo</span>
            : <span className="pro-badge"><Icon name="lock" size={11} />Pro</span>}
        </button>
        <div className="im-body">
          <div className="im-head">
            <span className="im-ico"><Icon name={itemIcon(item.name)} size={20} /></span>
            <div className="im-name">{item.name}</div>
          </div>

          <div className="im-loc">
            {zone && <span className="pill zone"><span className="dot"></span>{zoneName(zone, type)}</span>}
            {detail.length > 0 && <span className="loc-detail">{detail.join(' · ')}</span>}
          </div>

          <div className="im-qty">
            <span className="k">Quantity</span>
            <div className="qty-step">
              <button onClick={() => onQty(item.id, -1)} disabled={item.quantity <= 1} aria-label="Less">−</button>
              <span className="qv">{item.quantity}</span>
              <button onClick={() => onQty(item.id, 1)} aria-label="More">+</button>
            </div>
          </div>

          <div className="im-kv">
            <div className="r"><span className="k">Added</span><span className="v">{addDate}</span></div>
            <div className="r"><span className="k">Expires</span>
              <span className="v">{expDate
                ? <span className={'expiry ' + status}><span className="d"></span>{expDate}</span>
                : <span className="faint">no date set</span>}</span></div>
            {expDate && status !== 'ok' && (
              <div className="r"><span className="k">Status</span>
                <span className="v"><span className={'expiry ' + status}>{expiryLabel(item.expiry)}{status === 'gone' ? ' ago' : ' left'}</span></span></div>
            )}
          </div>

          {item.tags?.length > 0 && (
            <div className="im-tags">{item.tags.map(tg => <span key={tg} className="tag">{tg}</span>)}</div>
          )}

          <div className="row" style={{ gap: 8, marginTop: 4 }}>
            <button className="btn subtle" style={{ flex: 1, fontSize: 14, padding: '11px' }}><Icon name="edit" size={16} />Edit</button>
            <button className="btn outline danger-btn" style={{ fontSize: 14, padding: '11px 14px' }} onClick={() => onRemove(item.id)}><Icon name="trash" size={16} />Remove</button>
          </div>
          {!pro && (
            <button className="row im-pro-row" onClick={onPhoto}>
              <Icon name="lock" size={12} /> Photos &amp; change history are Pro
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  const saved = useRef(loadState()).current;
  const [user, setUser]     = useState(saved?.user || null);
  const [spaces, setSpaces] = useState(saved?.spaces || []);
  const [currentId, setCurrentId] = useState(saved?.currentId || null);
  const [phase, setPhase]   = useState(saved?.phase || 'landing');
  const [view, setView]     = useState(saved?.view || 'list');
  const [grouped, setGrouped] = useState(saved?.grouped ?? false);
  const [frame, setFrame]   = useState(saved?.frame || 'fit');
  const [promoDismissed, setPromoDismissed] = useState(saved?.promoDismissed ?? false);
  const [syncOn, setSyncOn] = useState(saved?.syncOn ?? false);

  const [selId, setSelId] = useState(null);
  const [selZoneId, setSelZoneId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [addTarget, setAddTarget] = useState(null);
  const [justAddedId, setJustAddedId] = useState(null);
  const [lastZoneName, setLastZoneName] = useState(null);
  const [paywall, setPaywall] = useState(null);     // { reason }
  const [returnTo, setReturnTo] = useState('dashboard');

  const space = spaces.find(s => s.id === currentId) || null;
  // effective plan — the forcePlan tweak lets a reviewer preview either tier
  const plan = planOf((t.forcePlan && t.forcePlan !== 'auto') ? { plan: t.forcePlan } : user);

  // persist
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ user, spaces, currentId, phase, view, grouped, frame, promoDismissed, syncOn }));
    } catch (e) {}
  }, [user, spaces, currentId, phase, view, grouped, frame, promoDismissed, syncOn]);

  // apply visual tweaks
  useEffect(() => {
    const r = document.documentElement.style;
    r.setProperty('--pad', t.density === 'compact' ? '0.78' : t.density === 'cozy' ? '1' : '1.18');
    if (t.corners === 'sharp') { r.setProperty('--r-card', '8px'); r.setProperty('--r-ctrl', '7px'); }
    else { r.setProperty('--r-card', '16px'); r.setProperty('--r-ctrl', '11px'); }
  }, [t.density, t.corners]);

  // update the currently-open space
  const setSpace = (updater) => setSpaces(list => list.map(s => s.id === currentId
    ? (typeof updater === 'function' ? updater(s) : updater) : s));

  /* ---------- auth & navigation ---------- */
  function completeAuth(email) {
    setUser(u => u || { name: nameFromEmail(email), email, plan: 'free' });
    setSpaces(list => list.length ? list : [seedFridge()]);
    setPhase('dashboard');
  }
  function signOut() { setCurrentId(null); setEditing(false); setPhase('landing'); }
  function goPricing() { setReturnTo(phase === 'app' ? 'app' : phase === 'account' ? 'account' : 'dashboard'); setPaywall(null); setPhase('pricing'); }
  function goAccount() { setReturnTo(phase); setPhase('account'); }
  function upgrade() { setUser(u => ({ ...(u || { name: 'You', email: 'you@storebook.app' }), plan: 'pro' })); setPaywall(null); setPhase(returnTo || 'dashboard'); }
  function downgrade() { setUser(u => ({ ...u, plan: 'free' })); }
  function toggleSync() { if (!plan.sync) { setPaywall({ reason: 'sync' }); return; } setSyncOn(v => !v); }

  /* ---------- space CRUD ---------- */
  function openSpace(id) {
    const sp = spaces.find(s => s.id === id);
    setCurrentId(id); setEditing(false); setSelId(null); setSelZoneId(null);
    setView(sp && sp.viewMode === 'grid' ? 'layout' : 'list');
    setPromoDismissed(false); setPhase('app');
  }
  function newSpace() {
    if (!isInf(plan.spaces) && spaces.length >= plan.spaces) { setPaywall({ reason: 'spaces' }); return; }
    setPhase('create');
  }
  function addSpaceAndOpen(newSp) {
    setSpaces(list => [...list, newSp]);
    setCurrentId(newSp.id); setEditing(false); setSelId(null);
    setView(newSp.viewMode === 'grid' ? 'layout' : 'list');
    setPromoDismissed(false); setPhase('app');
  }
  function renameSpace(id, name) { setSpaces(list => list.map(s => s.id === id ? { ...s, name } : s)); }
  function deleteSpace(id) {
    setSpaces(list => list.filter(s => s.id !== id));
    if (currentId === id) setCurrentId(null);
  }
  function duplicateSpace(id) {
    if (!isInf(plan.spaces) && spaces.length >= plan.spaces) { setPaywall({ reason: 'spaces' }); return; }
    const sp = spaces.find(s => s.id === id);
    if (sp) setSpaces(list => [...list, cloneSpace(sp)]);
  }
  function backToDashboard() { setCurrentId(null); setEditing(false); setPhase('dashboard'); }

  /* ---------- item ops (limit-gated) ---------- */
  function flashAdded(id, zoneName_) { setJustAddedId(id); setLastZoneName(zoneName_); setTimeout(() => setJustAddedId(null), 600); }
  function atItemLimit() {
    if (!isInf(plan.items) && space && space.items.length >= plan.items) { setPaywall({ reason: 'items' }); return true; }
    return false;
  }
  function addItemToZone(name, zone, quantity) {
    if (atItemLimit()) return;
    const count = space.items.filter(it => it.zoneId === zone.id && (it.depth || 'front') === 'front').length;
    const item = { id: uid('item'), name, zoneId: zone.id, quantity, tags: [],
      dateAdded: new Date().toISOString(), expiry: null, photo: null, slotIndex: count, depth: 'front' };
    setSpace(s => ({ ...s, items: [item, ...s.items] }));
    flashAdded(item.id, zoneName(zone, space.type));
  }
  function onAdd(text) {
    const { name, zoneHint, quantity } = parseAdd(text);
    if (!name) return;
    const zone = matchZone(zoneHint, space.zones, space.type) || space.zones[0];
    if (zone) addItemToZone(name, zone, quantity);
  }
  function onAddStructured(name, zoneId, qty) {
    const zone = space.zones.find(z => z.id === zoneId) || space.zones[0];
    if (zone) addItemToZone(cap(name), zone, qty);
  }
  function onRemove(id) { setSpace(s => ({ ...s, items: s.items.filter(it => it.id !== id) })); if (selId === id) setSelId(null); }
  function adjustQty(id, delta) { setSpace(s => ({ ...s, items: s.items.map(it => it.id === id ? { ...it, quantity: Math.max(1, it.quantity + delta) } : it) })); }

  /* ---------- zone ops (limit-gated) ---------- */
  function updateZone(id, patch) { setSpace(s => ({ ...s, zones: s.zones.map(z => z.id === id ? { ...z, ...patch } : z) })); }
  function deleteZone(id) {
    const n = space.items.filter(it => it.zoneId === id).length;
    if (!confirm(`Delete this zone${n ? ` and its ${n} item${n > 1 ? 's' : ''}` : ''}?`)) return;
    setSpace(s => ({ ...s, zones: s.zones.filter(z => z.id !== id), items: s.items.filter(it => it.zoneId !== id) }));
    if (selZoneId === id) setSelZoneId(null);
  }
  function atZoneLimit() {
    if (!isInf(plan.zones) && space && space.zones.length >= plan.zones) { setPaywall({ reason: 'zones' }); return true; }
    return false;
  }
  function addZoneFree(rect, kind) {
    if (atZoneLimit()) return;
    const id = uid('zone');
    setSpace(s => {
      const pos = s.zones.length + 1;
      const zone = { id, position: pos, label: null, color: ZONE_COLORS[(pos - 1) % ZONE_COLORS.length],
        hasDepth: false, floor: kind === 'floor', kind, facing: 'front', levels: 1, column: 0, rect };
      return { ...s, zones: [...s.zones, zone] };
    });
    setSelZoneId(id);
  }
  function addZoneColumn(c) {
    if (atZoneLimit()) return;
    const id = uid('zone');
    setSpace(s => {
      const pos = s.zones.length + 1;
      const zone = { id, position: pos, label: null, color: ZONE_COLORS[(pos - 1) % ZONE_COLORS.length],
        hasDepth: false, floor: false, kind: 'shelf', facing: 'front', levels: 1, column: c, rect: null };
      return { ...s, zones: [...s.zones, zone] };
    });
    setSelZoneId(id);
  }
  function convertFreeform() {
    setSpace(s => { const zones = s.zones.map(z => ({ ...z })); flowFreeform(zones); return { ...s, canvasMode: 'freeform', zones }; });
  }

  function openAddItem(zone, depth, level) {
    if (atItemLimit()) return;
    const lvl = level || 1;
    const parts = [];
    if (zone.levels > 1) parts.push(`level ${lvl}`);
    if (zone.hasDepth) parts.push(`${depth || 'front'} layer`);
    setAddTarget({ zoneId: zone.id, depth: depth || 'front', level: lvl, zoneName: zoneName(zone, space.type), sub: parts.join(' · ') });
  }
  function confirmAddSlot(name, qty) {
    if (!name.trim()) { setAddTarget(null); return; }
    if (atItemLimit()) { setAddTarget(null); return; }
    const { zoneId, depth, level } = addTarget;
    const maxIdx = space.items.filter(it => it.zoneId === zoneId && (it.depth || 'front') === depth && (it.level || 1) === level)
      .reduce((m, it) => Math.max(m, it.slotIndex ?? 0), -1);
    const item = { id: uid('item'), name: cap(name.trim()), zoneId, quantity: qty, tags: [],
      dateAdded: new Date().toISOString(), expiry: null, photo: null, slotIndex: maxIdx + 1, depth, level };
    setSpace(s => ({ ...s, items: [item, ...s.items] }));
    setAddTarget(null);
  }
  function onPhoto() { if (!plan.photos) setPaywall({ reason: 'photos' }); }

  const canLayout = space && space.type !== 'list';
  const showPromo = t.showLayoutPrompt && !promoDismissed && view === 'list' && canLayout;
  const productPhase = phase === 'dashboard' || phase === 'pricing' || phase === 'account';

  return (
    <div className="chrome">
      <div className="topbar">
        <div className="brand">
          <span className="mark"><Icon name="grid" size={13} /></span>
          storebook
        </div>
        <span className="spacer"></span>
        <div className="seg" role="group" aria-label="Frame size">
          {[['phone','Phone'],['tablet','Tablet'],['desktop','Desktop'],['fit','Fit']].map(([k, lbl]) => (
            <button key={k} className={frame === k ? 'on' : ''} onClick={() => setFrame(k)}>{lbl}</button>
          ))}
        </div>
        <button className="ghost-btn" onClick={() => { if (confirm('Restart the demo? This clears your account and all spaces.')) { localStorage.removeItem(LS_KEY); localStorage.removeItem('storebook_v1'); location.reload(); } }}>
          <Icon name="restart" size={15} />Restart
        </button>
      </div>

      <div className="frame-wrap">
        <div className={'frame ' + frame}>
          <div className="app">
            {phase === 'landing' && (
              <Landing onGetStarted={() => setPhase('auth')} onSignIn={() => setPhase('auth')} onPricing={goPricing} />
            )}

            {phase === 'auth' && (
              <Auth onAuthed={completeAuth} onBack={() => setPhase('landing')} />
            )}

            {productPhase && (
              <AppNav user={user} plan={plan} active={phase} onHome={backToDashboard} onPricing={goPricing} onAccount={goAccount} />
            )}

            {phase === 'dashboard' && user && (
              <Dashboard user={user} spaces={spaces} plan={plan} dashStyle={t.dashStyle}
                onOpen={openSpace} onNew={newSpace} onRename={renameSpace} onDelete={deleteSpace}
                onDuplicate={duplicateSpace} onUpgrade={goPricing} />
            )}

            {phase === 'create' && (
              <Onboarding onComplete={addSpaceAndOpen} onCancel={() => setPhase('dashboard')} />
            )}

            {phase === 'pricing' && (
              <Pricing user={user} onUpgrade={upgrade} onDowngrade={downgrade} onBack={() => setPhase(returnTo || 'dashboard')} />
            )}

            {phase === 'account' && user && (
              <Account user={user} spaces={spaces} plan={plan} syncOn={syncOn} onToggleSync={toggleSync}
                onUpgrade={goPricing} onDowngrade={downgrade} onSignOut={signOut} onBack={() => setPhase(returnTo === 'app' ? 'app' : 'dashboard')} />
            )}

            {phase === 'app' && space && (
              <React.Fragment>
                <div className="app-head">
                  <div className={'app-head-inner' + (view === 'layout' ? ' wide' : '')}>
                    <button className="iconbtn head-back" onClick={backToDashboard} aria-label="Back to spaces"><Icon name="arrowL" size={18} /></button>
                    <div className="space-name">
                      <div className="nm">{space.name}</div>
                      <div className="meta">{space.items.length} items · {space.zones.length} zones</div>
                    </div>
                    <span className="spacer" style={{ flex: 1 }}></span>
                    {canLayout && !editing && (
                      <div className="seg">
                        <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}><Icon name="list" size={15} />List</button>
                        <button className={view === 'layout' ? 'on' : ''} onClick={() => setView('layout')}><Icon name="grid" size={15} />Layout</button>
                      </div>
                    )}
                    {editing && <span className="pill" style={{ borderColor: 'var(--border-strong)' }}><Icon name="edit" size={13} />Editing layout</span>}
                    <button className="appnav-avatar sm" onClick={goAccount} aria-label="Account">{(user?.name || '?').slice(0,1).toUpperCase()}</button>
                  </div>
                </div>

                {view === 'list' && (
                  <ListScreen space={space} onAdd={onAdd} onAddStructured={onAddStructured}
                    onRemove={onRemove} onSelect={setSelId} grouped={grouped} setGrouped={setGrouped}
                    showPromo={showPromo} dismissPromo={() => setPromoDismissed(true)}
                    onOpenLayout={() => setView('layout')} addMode={t.addMode}
                    justAddedId={justAddedId} lastZoneName={lastZoneName} />
                )}
                {view === 'layout' && !editing && (
                  <LayoutScreen space={space} selId={selId} onSelect={setSelId}
                    onRemove={onRemove} onEdit={() => { setEditing(true); setSelZoneId(null); }}
                    onAddItem={openAddItem} />
                )}
                {view === 'layout' && editing && (
                  <CanvasEditor space={space} selZoneId={selZoneId} onSelectZone={setSelZoneId}
                    onUpdateZone={updateZone} onDeleteZone={deleteZone}
                    onAddZoneFree={addZoneFree} onAddZoneColumn={addZoneColumn}
                    onConvertFreeform={convertFreeform} onDone={() => setEditing(false)} />
                )}
              </React.Fragment>
            )}
          </div>
        </div>
      </div>

      <AddSlotModal target={addTarget} onConfirm={confirmAddSlot} onCancel={() => setAddTarget(null)} />
      {!addTarget && selId && space && (() => {
        const it = space.items.find(i => i.id === selId);
        if (!it) return null;
        const zn = space.zones.find(z => z.id === it.zoneId);
        return <ItemModal item={it} zone={zn} type={space.type} pro={plan.photos}
          onClose={() => setSelId(null)} onRemove={onRemove} onQty={adjustQty} onPhoto={onPhoto} />;
      })()}

      <Paywall reason={paywall?.reason} plan={plan} onClose={() => setPaywall(null)} onSeePlans={goPricing} />

      <TweaksPanel>
        <TweakSection label="Plans (demo)" />
        <TweakRadio label="Preview plan" value={t.forcePlan} options={['auto', 'free', 'pro']}
          onChange={v => setTweak('forcePlan', v)} />
        <TweakSection label="Dashboard" />
        <TweakRadio label="Layout" value={t.dashStyle} options={['cards', 'rows', 'boards']}
          onChange={v => setTweak('dashStyle', v)} />
        <TweakSection label="Layout" />
        <TweakRadio label="Density" value={t.density} options={['compact', 'cozy', 'airy']}
          onChange={v => setTweak('density', v)} />
        <TweakRadio label="Corners" value={t.corners} options={['soft', 'sharp']}
          onChange={v => setTweak('corners', v)} />
        <TweakSection label="Add items" />
        <TweakRadio label="Input style" value={t.addMode} options={['smart', 'structured']}
          onChange={v => setTweak('addMode', v)} />
        <TweakToggle label="Show “see as layout” prompt" value={t.showLayoutPrompt}
          onChange={v => setTweak('showLayoutPrompt', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
