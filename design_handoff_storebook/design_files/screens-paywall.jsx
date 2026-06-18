/* screens-paywall.jsx — limit-reached upgrade prompt. reason ∈ keys of PAYWALL. */
function Paywall({ reason, plan, onClose, onSeePlans }) {
  if (!reason) return null;
  const info = PAYWALL[reason] || PAYWALL.spaces;
  const limit = plan[reason];
  const benefits = [
    { icon: 'grid',    t: 'Unlimited spaces' },
    { icon: 'columns', t: 'Unlimited cabinets & shelves' },
    { icon: 'box',     t: 'Unlimited items' },
    { icon: 'lock',    t: 'Photos on every item' },
    { icon: 'restart', t: 'Sync across devices' },
  ];
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal paywall" onClick={e => e.stopPropagation()}>
        <button className="iconbtn modal-x" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
        <div className="pw-ico"><Icon name={info.icon} size={24} /></div>
        <div className="pw-badge"><span className="pro-badge"><Icon name="sparkle" size={11} />Pro</span></div>
        <h2 className="pw-title">{info.title}</h2>
        <p className="pw-body">{info.body(limit)}</p>

        <ul className="pw-list">
          {benefits.map((b, i) => (
            <li key={i}><span className="pw-check"><Icon name="check" size={13} /></span>{b.t}</li>
          ))}
        </ul>

        <div className="pw-actions">
          <button className="btn primary block" onClick={onSeePlans}><Icon name="sparkle" size={17} />See Pro plans</button>
          <button className="btn subtle block" onClick={onClose}>Not now</button>
        </div>
        <div className="pw-fine faint">From $4/mo billed yearly · cancel anytime</div>
      </div>
    </div>
  );
}

Object.assign(window, { Paywall });
