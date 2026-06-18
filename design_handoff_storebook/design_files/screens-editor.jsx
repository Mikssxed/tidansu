/* screens-editor.jsx — canvas editor: draw / move / resize zones, tool palette,
   properties panel. Works in freeform (full canvas) and columns (structured) modes. */
const { useState: useStateEd, useRef: useRefEd, useEffect: useEffectEd, useReducer: useReducerEd } = React;

const ED_TOOLS = [
  ['move',   'cursor', 'Move'],
  ['draw',   'square', 'Zone'],
  ['drawer', 'drawer', 'Drawer'],
  ['floor',  'floorI', 'Floor'],
  ['delete', 'trash',  'Delete'],
];
const ED_UNIT = 24;
const edSnap = v => Math.round(v / ED_UNIT) * ED_UNIT;

/* ---------- small controls ---------- */
function Stepper({ label, value, min, max, onChange }) {
  return (
    <div className="stepper">
      <span className="st-label">{label}</span>
      <div className="st-ctrls">
        <button onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}>−</button>
        <span className="st-val">{value}</span>
        <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>+</button>
      </div>
    </div>
  );
}

/* ---------- right: zone properties ---------- */
function ZoneProps({ space, zone, freeform, onUpdate, onDelete }) {
  if (!zone) return (
    <div className="props">
      <div className="props-empty">
        <Icon name="settings" size={20} style={{ opacity: .5 }} />
        <p>{freeform ? 'Draw a zone, or pick one to edit its name, wall, color and depth.' : 'Select a zone to edit its name, wall, color and depth.'}</p>
      </div>
    </div>
  );
  const auto = zoneName({ ...zone, label: null }, space.type);
  const kind = zone.floor ? 'floor' : (zone.kind || 'shelf');
  const setKind = k => {
    if (k === 'floor') onUpdate(zone.id, { kind: 'floor', floor: true, hasDepth: false });
    else onUpdate(zone.id, { kind: k, floor: false });
  };
  return (
    <div className="props">
      <div className="props-head"><Icon name="settings" size={15} /> Zone properties</div>
      <div className="props-body">
        <div className="field">
          <label>Name</label>
          <div className="field-row">
            <input value={zone.label || ''} placeholder={auto}
                   onChange={e => onUpdate(zone.id, { label: e.target.value || null })} />
            {zone.label && <button className="mini-clear" title="Reset to auto name" onClick={() => onUpdate(zone.id, { label: null })}><Icon name="restart" size={14} /></button>}
          </div>
          {!zone.label && <span className="field-hint">Auto-numbered. Type to override.</span>}
        </div>

        <div className="field">
          <label>Type</label>
          <div className="kind-seg">
            {[['shelf', 'Shelf'], ['drawer', 'Drawer'], ['floor', 'Floor']].map(([k, lbl]) => (
              <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{lbl}</button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Color</label>
          <div className="swatches">
            {ZONE_COLORS.map(c => (
              <button key={c} className={'swatch z-' + c + (zone.color === c ? ' on' : '')} onClick={() => onUpdate(zone.id, { color: c })} aria-label={c} />
            ))}
          </div>
        </div>

        {!zone.floor && (
          <div className="field">
            <label>Levels (tiers)</label>
            <Stepper label="Shelves in this unit" value={zone.levels || 1} min={1} max={12} onChange={v => onUpdate(zone.id, { levels: v })} />
            <div className="levels-preview">
              {Array.from({ length: Math.min(zone.levels || 1, 12) }).map((_, i) => (
                <i key={i} className={'z-' + zone.color}><span>L{i + 1}</span></i>
              ))}
            </div>
            <span className="field-hint">A unit can stack several shelves. Level 1 is the top.</span>
          </div>
        )}

        {!zone.floor && (
          <div className="field">
            <label>Facing wall</label>
            <div className="kind-seg quad">
              {FACINGS.map(([f, lbl]) => (
                <button key={f} className={(zone.facing || 'front') === f ? 'on' : ''} onClick={() => onUpdate(zone.id, { facing: f })}>{lbl}</button>
              ))}
            </div>
            <span className="field-hint">Which wall this shelf sits against. Groups the Shelves view by wall.</span>
          </div>
        )}

        {!zone.floor && (
          <div className="field">
            <label>Depth</label>
            <button className={'depth-toggle' + (zone.hasDepth ? ' on' : '')} onClick={() => onUpdate(zone.id, { hasDepth: !zone.hasDepth })}>
              <span className="dt-box">{zone.hasDepth && <Icon name="check" size={13} />}</span>
              <span>Has front / back layers</span>
            </button>
            <span className="field-hint">{zone.hasDepth ? 'Two depth bands — front-on, layer by layer. No 3D.' : 'Off: one shelf surface. On: items split into front / back.'}</span>
          </div>
        )}

        {!freeform && space.layoutColumns > 1 && (
          <div className="field">
            <label>Column</label>
            <div className="kind-seg">
              {Array.from({ length: space.layoutColumns }).map((_, c) => (
                <button key={c} className={(zone.column || 0) === c ? 'on' : ''} onClick={() => onUpdate(zone.id, { column: c })}>
                  {(space.columnLabels && space.columnLabels[c]) || ('Col ' + (c + 1))}
                </button>
              ))}
            </div>
          </div>
        )}

        <button className="btn outline danger-btn" onClick={() => onDelete(zone.id)}><Icon name="trash" size={16} />Delete zone</button>
      </div>
    </div>
  );
}

/* ---------- columns-mode editor (structured) ---------- */
function ColumnsEdit({ space, selZoneId, onSelectZone, onAddZoneColumn }) {
  const type = space.type;
  const n = space.layoutColumns || 1;
  return (
    <div className="cols-edit-scroll">
      <div className={'cols-edit cols-' + n}>
        {Array.from({ length: n }).map((_, c) => (
          <div className="cedit-col" key={c}>
            {n > 1 && <div className="cedit-col-h">{(space.columnLabels && space.columnLabels[c]) || ('Column ' + (c + 1))}</div>}
            {space.zones.filter(z => (z.column || 0) === c).map(z => (
              <button key={z.id} className={'cedit-zone z-' + z.color + (z.id === selZoneId ? ' sel' : '')} onClick={() => onSelectZone(z.id)}>
                <span className="sw"></span>
                <span className="cz-main">
                  <span className="nm">{zoneName(z, type)}</span>
                  <span className="cz-meta">{z.floor ? 'floor · ground' : `${(z.facing || 'front')} wall${(z.levels || 1) > 1 ? ` · ${z.levels} levels` : ''}`}{z.hasDepth ? ' · front/back' : ''}</span>
                </span>
                <span className="cz-count">{space.items.filter(it => it.zoneId === z.id).length}</span>
              </button>
            ))}
            <button className="cedit-add" onClick={() => onAddZoneColumn(c)}><Icon name="plus" size={15} />Add shelf</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- freeform canvas ---------- */
function FreeCanvas({ space, selZoneId, onSelectZone, onUpdateZone, onDeleteZone, onAddZoneFree, toolRef, tool }) {
  const canvasRef = useRefEd(null);
  const dragRef = useRefEd(null);
  const ghostRef = useRefEd(null);
  const liveRef = useRefEd(null);
  const apiRef = useRefEd({});
  apiRef.current = { onAddZoneFree, onUpdateZone };
  const [, force] = useReducerEd(x => x + 1, 0);
  const setGhost = r => { ghostRef.current = r; force(); };
  const setLive = r => { liveRef.current = r; force(); };

  useEffectEd(() => {
    const localPt = e => { const r = canvasRef.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const mv = e => {
      const d = dragRef.current; if (!d) return;
      const p = localPt(e);
      if (d.type === 'draw') {
        const x = Math.min(d.startX, p.x), y = Math.min(d.startY, p.y);
        setGhost({ x: edSnap(x), y: edSnap(y), w: edSnap(Math.abs(p.x - d.startX)), h: edSnap(Math.abs(p.y - d.startY)) });
      } else if (d.type === 'move') {
        setLive({ id: d.id, rect: { ...d.orig, x: Math.max(0, edSnap(d.orig.x + p.x - d.startX)), y: Math.max(0, edSnap(d.orig.y + p.y - d.startY)) } });
      } else if (d.type === 'resize') {
        setLive({ id: d.id, rect: { ...d.orig, w: Math.max(ED_UNIT * 5, edSnap(d.orig.w + p.x - d.startX)), h: Math.max(ED_UNIT * 4, edSnap(d.orig.h + p.y - d.startY)) } });
      }
    };
    const up = () => {
      const d = dragRef.current; if (!d) return;
      const g = ghostRef.current, lv = liveRef.current;
      if (d.type === 'draw' && g && g.w >= ED_UNIT * 4 && g.h >= ED_UNIT * 3) {
        const t = toolRef.current;
        apiRef.current.onAddZoneFree({ ...g }, t === 'floor' ? 'floor' : t === 'drawer' ? 'drawer' : 'shelf');
      } else if ((d.type === 'move' || d.type === 'resize') && lv) {
        apiRef.current.onUpdateZone(lv.id, { rect: lv.rect });
      }
      dragRef.current = null; setGhost(null); setLive(null);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
  }, []);

  function canvasDown(e) {
    const t = toolRef.current;
    if (!['draw', 'drawer', 'floor'].includes(t)) { onSelectZone(null); return; }
    if (e.target.closest('.ezone')) return;
    const r = canvasRef.current.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    dragRef.current = { type: 'draw', startX: sx, startY: sy };
    setGhost({ x: edSnap(sx), y: edSnap(sy), w: 0, h: 0 });
  }
  function zoneDown(e, z) {
    e.stopPropagation();
    const t = toolRef.current;
    if (t === 'delete') { onDeleteZone(z.id); return; }
    onSelectZone(z.id);
    if (t === 'move') {
      const r = canvasRef.current.getBoundingClientRect();
      dragRef.current = { type: 'move', id: z.id, startX: e.clientX - r.left, startY: e.clientY - r.top, orig: { ...z.rect } };
    }
  }
  function resizeDown(e, z) {
    e.stopPropagation();
    const r = canvasRef.current.getBoundingClientRect();
    dragRef.current = { type: 'resize', id: z.id, startX: e.clientX - r.left, startY: e.clientY - r.top, orig: { ...z.rect } };
  }

  const live = liveRef.current, ghost = ghostRef.current;
  const rectOf = z => (live && live.id === z.id) ? live.rect : z.rect;
  const positioned = space.zones.filter(z => z.rect);
  const h = Math.max(360, ...positioned.map(z => { const r = rectOf(z); return r.y + r.h; }), ghost ? ghost.y + ghost.h : 0) + 64;

  return (
    <div className="editor-scroll">
      <div ref={canvasRef} className={'editor-canvas tool-' + tool} style={{ minHeight: h }} onPointerDown={canvasDown}>
        {positioned.map(z => {
          const r = rectOf(z); const sel = z.id === selZoneId;
          return (
            <div key={z.id} className={'ezone z-' + z.color + (sel ? ' sel' : '') + (z.floor ? ' floor' : '')}
                 style={{ left: r.x, top: r.y, width: r.w, height: r.h }} onPointerDown={e => zoneDown(e, z)}>
              <div className="ez-head"><span className="sw"></span><span className="nm">{zoneName(z, space.type)}</span></div>
              <div className="ez-meta">
                {z.floor ? 'floor · ground' : `${(z.levels || 1) > 1 ? (z.levels + ' levels · ') : ''}${space.items.filter(it => it.zoneId === z.id).length} items`}{z.hasDepth ? ' · front/back' : ''}
              </div>
              {!z.floor && (z.levels || 1) > 1 && (
                <div className="ez-levels">{Array.from({ length: Math.min(z.levels, 10) }).map((_, i) => <i key={i} />)}</div>
              )}
              {!z.floor && (
                <div className="ez-facing"><Icon name="columns" size={11} />{(z.facing || 'front')} wall</div>
              )}
              {sel && <div className="ez-resize" onPointerDown={e => resizeDown(e, z)}><Icon name="chevRight" size={12} /></div>}
            </div>
          );
        })}
        {ghost && ghost.w > 4 && <div className="ghost" style={{ left: ghost.x, top: ghost.y, width: ghost.w, height: ghost.h }} />}
        {positioned.length === 0 && !ghost && (
          <div className="canvas-hint"><Icon name="square" size={22} style={{ opacity: .5 }} /><br />Pick a tool on the left, then drag here to draw a zone.</div>
        )}
      </div>
    </div>
  );
}

/* ---------- editor shell ---------- */
function CanvasEditor({ space, selZoneId, onSelectZone, onUpdateZone, onDeleteZone, onAddZoneFree, onAddZoneColumn, onConvertFreeform, onDone }) {
  const freeform = space.canvasMode === 'freeform';
  const [tool, setToolS] = useStateEd('move');
  const toolRef = useRefEd('move');
  const setTool = t => { toolRef.current = t; setToolS(t); };
  const selZone = space.zones.find(z => z.id === selZoneId) || null;

  return (
    <div className="editor">
      <div className="editor-bar">
        <button className="iconbtn" onClick={onDone} aria-label="Back"><Icon name="arrowL" size={18} /></button>
        <div className="col" style={{ gap: 1 }}>
          <div className="eb-title">Edit layout</div>
          <div className="eb-sub">{freeform ? 'Free canvas — draw zones anywhere' : 'Column layout'}</div>
        </div>
        <span className="spacer" style={{ flex: 1 }}></span>
        {!freeform && <button className="btn subtle" style={{ fontSize: 13.5, padding: '9px 12px' }} onClick={onConvertFreeform}><Icon name="square" size={15} />Draw freely</button>}
        <button className="btn primary" style={{ fontSize: 13.5, padding: '9px 14px' }} onClick={onDone}><Icon name="check" size={16} />Done</button>
      </div>

      <div className="editor-body">
        {freeform && (
          <div className="tool-palette">
            {ED_TOOLS.map(([id, ic, lbl]) => (
              <button key={id} className={'tool' + (tool === id ? ' on' : '')} onClick={() => setTool(id)} title={lbl}>
                <Icon name={ic} size={19} /><span>{lbl}</span>
              </button>
            ))}
          </div>
        )}
        <div className="editor-center">
          {freeform
            ? <FreeCanvas space={space} selZoneId={selZoneId} onSelectZone={onSelectZone}
                onUpdateZone={onUpdateZone} onDeleteZone={onDeleteZone} onAddZoneFree={onAddZoneFree}
                toolRef={toolRef} tool={tool} />
            : <ColumnsEdit space={space} selZoneId={selZoneId} onSelectZone={onSelectZone} onAddZoneColumn={onAddZoneColumn} />}
        </div>
        <ZoneProps space={space} zone={selZone} freeform={freeform} onUpdate={onUpdateZone} onDelete={onDeleteZone} />
      </div>
    </div>
  );
}

Object.assign(window, { CanvasEditor });
