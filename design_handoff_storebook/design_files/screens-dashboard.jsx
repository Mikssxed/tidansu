/* screens-dashboard.jsx — the home menu: grid of spaces with create / rename / delete.
   Three layouts (dashStyle tweak): cards · rows · boards.  Enforces the Free space cap. */
const { useState: useStateDash } = React;

const TYPE_META = Object.fromEntries(SPACE_TYPES.map(s => [s.id, s]));
const typeIcon = t => (TYPE_META[t] && TYPE_META[t].icon) || 'cabinet';
const typeName = t => (TYPE_META[t] && TYPE_META[t].title) || 'Space';

// tiny faithful preview of a space's zones
function SpaceMini({ space }) {
  const zones = space.zones.slice(0, 6);
  return (
    <div className="sc-mini">
      {zones.map(z => (
        <div className={'sc-band z-' + z.color} key={z.id}>
          <span className="sw"></span>
          <i style={{ width: (28 + (z.id.length * 7) % 46) + '%' }}></i>
          {space.items.filter(it => it.zoneId === z.id).length > 0 &&
            <i style={{ width: (18 + (z.position * 9) % 30) + '%', opacity: .6 }}></i>}
        </div>
      ))}
      {space.zones.length === 0 && <div className="sc-empty-mini">empty</div>}
    </div>
  );
}

function RowMenu({ onRename, onDuplicate, onDelete, onClose }) {
  return (
    <React.Fragment>
      <div className="menu-scrim" onClick={onClose}></div>
      <div className="card-menu" onClick={e => e.stopPropagation()}>
        <button onClick={onRename}><Icon name="edit" size={15} />Rename</button>
        <button onClick={onDuplicate}><Icon name="layers" size={15} />Duplicate</button>
        <button className="danger" onClick={onDelete}><Icon name="trash" size={15} />Delete</button>
      </div>
    </React.Fragment>
  );
}

function SpaceCard({ space, onOpen, onRename, onDuplicate, onDelete }) {
  const [menu, setMenu] = useStateDash(false);
  const { items, zones } = cardCountsOf(space);
  return (
    <div className="space-card" onClick={onOpen} role="button" tabIndex={0}>
      <div className="sc-top">
        <span className="sc-ico"><Icon name={typeIcon(space.type)} size={19} /></span>
        <div className="sc-name-wrap">
          <div className="sc-name">{space.name}</div>
          <div className="sc-type">{typeName(space.type)}</div>
        </div>
        <div className="sc-menu-wrap" onClick={e => e.stopPropagation()}>
          <button className="iconbtn sc-menu-btn" onClick={() => setMenu(m => !m)} aria-label="More"><Icon name="dots" size={16} /></button>
          {menu && <RowMenu onClose={() => setMenu(false)}
            onRename={() => { setMenu(false); onRename(); }}
            onDuplicate={() => { setMenu(false); onDuplicate(); }}
            onDelete={() => { setMenu(false); onDelete(); }} />}
        </div>
      </div>
      <SpaceMini space={space} />
      <div className="sc-foot">
        <span className="sc-stat"><Icon name="box" size={14} />{items} {items === 1 ? 'item' : 'items'}</span>
        <span className="sc-stat"><Icon name="columns" size={14} />{zones} {zones === 1 ? 'zone' : 'zones'}</span>
        <span className="spacer"></span>
        <span className="sc-open">Open<Icon name="arrowR" size={15} /></span>
      </div>
    </div>
  );
}

function SpaceRow({ space, onOpen, onRename, onDuplicate, onDelete }) {
  const [menu, setMenu] = useStateDash(false);
  const { items, zones } = cardCountsOf(space);
  return (
    <div className="space-row" onClick={onOpen} role="button" tabIndex={0}>
      <span className="sc-ico"><Icon name={typeIcon(space.type)} size={18} /></span>
      <div className="sr-main">
        <div className="sc-name">{space.name}</div>
        <div className="sc-type">{typeName(space.type)} · {items} items · {zones} zones</div>
      </div>
      <div className="sr-dots">{space.zones.slice(0, 5).map(z => <span key={z.id} className={'dot z-' + z.color}></span>)}</div>
      <span className="sc-open desktop-only">Open</span>
      <div className="sc-menu-wrap" onClick={e => e.stopPropagation()}>
        <button className="iconbtn sc-menu-btn" onClick={() => setMenu(m => !m)} aria-label="More"><Icon name="dots" size={16} /></button>
        {menu && <RowMenu onClose={() => setMenu(false)}
          onRename={() => { setMenu(false); onRename(); }}
          onDuplicate={() => { setMenu(false); onDuplicate(); }}
          onDelete={() => { setMenu(false); onDelete(); }} />}
      </div>
    </div>
  );
}

function NameModal({ title, label, initial, confirmLabel, onConfirm, onCancel }) {
  const [val, setVal] = useStateDash(initial || '');
  return (
    <div className="modal-back" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{title}</div>
          <button className="iconbtn" style={{ width: 34, height: 34 }} onClick={onCancel}><Icon name="x" size={16} /></button>
        </div>
        <label className="kicker" style={{ display: 'block', marginBottom: 8 }}>{label}</label>
        <input className="name-field" autoFocus value={val} onChange={e => setVal(e.target.value)}
               onKeyDown={e => e.key === 'Enter' && val.trim() && onConfirm(val.trim())} />
        <div className="row" style={{ gap: 9, marginTop: 16 }}>
          <button className="btn subtle" style={{ flex: 1 }} onClick={onCancel}>Cancel</button>
          <button className="btn primary" style={{ flex: 1 }} disabled={!val.trim()} onClick={() => onConfirm(val.trim())}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ title, body, confirmLabel, danger, onConfirm, onCancel }) {
  return (
    <div className="modal-back" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{title}</div>
          <button className="iconbtn" style={{ width: 34, height: 34 }} onClick={onCancel}><Icon name="x" size={16} /></button>
        </div>
        <p className="confirm-body">{body}</p>
        <div className="row" style={{ gap: 9, marginTop: 18 }}>
          <button className="btn subtle" style={{ flex: 1 }} onClick={onCancel}>Cancel</button>
          <button className={'btn ' + (danger ? 'outline danger-btn' : 'primary')} style={{ flex: 1 }} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function Dashboard({ user, spaces, plan, dashStyle, onOpen, onNew, onRename, onDelete, onDuplicate, onUpgrade }) {
  const [modal, setModal] = useStateDash(null);   // { kind:'rename'|'delete', space }
  const atLimit = !isInf(plan.spaces) && spaces.length >= plan.spaces;
  const style = dashStyle || 'cards';

  const close = () => setModal(null);
  const SpaceComp = style === 'rows' ? SpaceRow : SpaceCard;

  const cardProps = s => ({
    space: s, onOpen: () => onOpen(s.id),
    onRename: () => setModal({ kind: 'rename', space: s }),
    onDuplicate: () => onDuplicate(s.id),
    onDelete: () => setModal({ kind: 'delete', space: s }),
  });

  const newBtn = (
    <button className={'space-new' + (style === 'rows' ? ' as-row' : '')} onClick={onNew}>
      <span className="sn-ico"><Icon name={atLimit ? 'lock' : 'plus'} size={18} /></span>
      <span className="sn-t">{atLimit ? 'Upgrade for more spaces' : 'New space'}</span>
      <span className="sn-d">{atLimit ? `You’ve used all ${plan.spaces} on Free` : 'Fridge, freezer, cabinet, cellar…'}</span>
    </button>
  );

  return (
    <div className="dash">
      <div className="dash-head">
        <div className="col" style={{ gap: 3 }}>
          <h1>Your spaces</h1>
          <div className="dash-sub">{spaces.length} {spaces.length === 1 ? 'space' : 'spaces'} · {user.name}</div>
        </div>
        <span className="spacer"></span>
        <div className="dash-usage">
          <span className="du-label">{isInf(plan.spaces) ? 'Unlimited spaces' : `${spaces.length} of ${plan.spaces} spaces`}</span>
          {!isInf(plan.spaces) && (
            <div className="du-bar"><i style={{ width: Math.min(100, (spaces.length / plan.spaces) * 100) + '%' }} className={atLimit ? 'full' : ''}></i></div>
          )}
        </div>
        <button className="btn primary" onClick={onNew} disabled={false}>
          <Icon name={atLimit ? 'lock' : 'plus'} size={17} />New space
        </button>
      </div>

      {atLimit && (
        <div className="dash-upsell">
          <span className="du-ico"><Icon name="sparkle" size={16} /></span>
          <div className="du-txt"><b>You’re at the Free limit.</b> Upgrade to Pro for unlimited spaces, photos and sync across devices.</div>
          <button className="btn outline" onClick={onUpgrade}>Upgrade<Icon name="arrowR" size={15} /></button>
        </div>
      )}

      {spaces.length === 0 ? (
        <div className="dash-empty">
          <span className="de-ico"><Icon name="cabinet" size={26} /></span>
          <div className="de-t">No spaces yet</div>
          <div className="de-d">Create your first space — a fridge, a cabinet, a cellar — and start mapping what’s inside.</div>
          <button className="btn primary" onClick={onNew}><Icon name="plus" size={17} />Create a space</button>
        </div>
      ) : (
        <div className={'space-' + (style === 'rows' ? 'list' : style === 'boards' ? 'boards' : 'grid')}>
          {spaces.map(s => <SpaceComp key={s.id} {...cardProps(s)} />)}
          {newBtn}
        </div>
      )}

      {modal && modal.kind === 'rename' && (
        <NameModal title="Rename space" label="Space name" initial={modal.space.name}
          confirmLabel="Save" onCancel={close}
          onConfirm={name => { onRename(modal.space.id, name); close(); }} />
      )}
      {modal && modal.kind === 'delete' && (
        <ConfirmModal title="Delete space?" danger confirmLabel="Delete space"
          body={`“${modal.space.name}” and its ${modal.space.items.length} item${modal.space.items.length === 1 ? '' : 's'} will be permanently removed. This can’t be undone.`}
          onCancel={close} onConfirm={() => { onDelete(modal.space.id); close(); }} />
      )}
    </div>
  );
}

Object.assign(window, { Dashboard, NameModal, ConfirmModal });
