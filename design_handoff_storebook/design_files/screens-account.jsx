/* screens-account.jsx — profile, plan, usage meters, sync, sign out. */
const { useState: useStateAc } = React;

function Meter({ label, used, cap }) {
  const inf = isInf(cap);
  const pct = inf ? Math.min(100, used * 4) : Math.min(100, (used / cap) * 100);
  const full = !inf && used >= cap;
  return (
    <div className="meter">
      <div className="meter-top">
        <span className="meter-label">{label}</span>
        <span className={'meter-val' + (full ? ' full' : '')}>{used}{inf ? '' : ` / ${cap}`}{inf && <span className="faint"> · unlimited</span>}</span>
      </div>
      <div className="meter-bar"><i style={{ width: pct + '%' }} className={full ? 'full' : ''}></i></div>
    </div>
  );
}

function Account({ user, spaces, plan, syncOn, onToggleSync, onUpgrade, onDowngrade, onSignOut, onBack }) {
  const pro = plan.id === 'pro';
  const initials = (user.name || user.email || '?').trim().slice(0, 1).toUpperCase();
  const totalItems = spaces.reduce((n, s) => n + s.items.length, 0);
  const biggest = spaces.reduce((m, s) => Math.max(m, s.items.length), 0);

  return (
    <div className="acct">
      <div className="pr-top">
        <button className="ghost-btn" onClick={onBack}><Icon name="arrowL" size={15} />Back to spaces</button>
      </div>

      <div className="acct-profile">
        <span className="acct-avatar">{initials}</span>
        <div className="col" style={{ gap: 3, minWidth: 0 }}>
          <div className="acct-name">{user.name}</div>
          <div className="acct-email">{user.email}</div>
        </div>
        <span className="spacer"></span>
        <span className={'plan-pill ' + plan.id}>{pro ? <Icon name="sparkle" size={13} /> : null}{plan.name}</span>
      </div>

      {/* plan + billing */}
      <div className="acct-card">
        <div className="ac-head"><Icon name="sparkle" size={15} /><span>Plan</span></div>
        <div className="ac-body">
          {pro ? (
            <React.Fragment>
              <p className="ac-lead">You’re on <b>Pro</b> — unlimited spaces, item photos and sync across devices.</p>
              <div className="row" style={{ gap: 9 }}>
                <button className="btn subtle" onClick={onBack}>Manage billing</button>
                <button className="btn outline" onClick={onDowngrade}>Switch to Free</button>
              </div>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <p className="ac-lead">You’re on <b>Free</b> — {plan.spaces} spaces, {plan.items} items each, this device only.</p>
              <button className="btn primary" onClick={onUpgrade}><Icon name="sparkle" size={16} />Upgrade to Pro</button>
            </React.Fragment>
          )}
        </div>
      </div>

      {/* usage */}
      <div className="acct-card">
        <div className="ac-head"><Icon name="grid" size={15} /><span>Usage</span></div>
        <div className="ac-body" style={{ gap: 16 }}>
          <Meter label="Spaces" used={spaces.length} cap={plan.spaces} />
          <Meter label="Items (all spaces)" used={totalItems} cap={isInf(plan.items) ? Infinity : plan.items * Math.max(1, spaces.length)} />
          <Meter label="Fullest space" used={biggest} cap={plan.items} />
          {!pro && <div className="ac-hint"><Icon name="lock" size={13} />Limits apply per space. Upgrade to remove them all.</div>}
        </div>
      </div>

      {/* sync */}
      <div className="acct-card">
        <div className="ac-head"><Icon name="restart" size={15} /><span>Sync</span>{!pro && <span className="pro-badge" style={{ marginLeft: 'auto' }}><Icon name="lock" size={11} />Pro</span>}</div>
        <div className="ac-body">
          <button className={'sync-row' + (syncOn && pro ? ' on' : '')} onClick={onToggleSync}>
            <span className="sr-box">{syncOn && pro && <Icon name="check" size={13} />}</span>
            <div className="col" style={{ gap: 2, textAlign: 'left' }}>
              <span className="sr-t">Sync across devices</span>
              <span className="sr-d">{pro ? (syncOn ? 'Your spaces stay in step everywhere.' : 'Turn on to sync phone, tablet and laptop.') : 'Free plan keeps everything on this device only.'}</span>
            </div>
            {!pro && <Icon name="lock" size={15} style={{ marginLeft: 'auto', color: 'var(--text-3)' }} />}
          </button>
        </div>
      </div>

      <button className="btn outline acct-signout" onClick={onSignOut}><Icon name="arrowL" size={16} />Sign out</button>
    </div>
  );
}

Object.assign(window, { Account });
