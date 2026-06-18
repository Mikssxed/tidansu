/* screens-pricing.jsx — plans + comparison. Monthly / annual toggle. Mocked upgrade. */
const { useState: useStatePr } = React;

function PlanCard({ plan, billing, current, onChoose }) {
  const free = plan.id === 'free';
  const price = free ? 0 : (billing === 'year' ? plan.priceY / 12 : plan.priceM);
  const sub = free ? 'forever' : (billing === 'year' ? `billed $${plan.priceY}/yr` : 'billed monthly');
  return (
    <div className={'plan-card' + (free ? '' : ' pro') + (current ? ' current' : '')}>
      <div className="pc-head">
        <div className="pc-name">{plan.name}{!free && <span className="pro-badge">Pro</span>}</div>
        <div className="pc-tag">{plan.tagline}</div>
      </div>
      <div className="pc-price">
        <span className="pc-amt">${free ? 0 : (billing === 'year' ? (plan.priceY / 12).toFixed(0) : plan.priceM)}</span>
        <span className="pc-per">/mo</span>
      </div>
      <div className="pc-sub">{sub}{!free && billing === 'year' && <span className="pc-save">save 20%</span>}</div>

      <ul className="pc-list">
        {PLAN_FEATURES.map(f => (
          <li key={f.key} className={plan[f.key] === false ? 'off' : ''}>
            <Icon name={plan[f.key] === false ? 'x' : 'check'} size={15} />
            <span className="pc-k">{f.label}</span>
            <span className="pc-v">{f.fmt(plan[f.key])}</span>
          </li>
        ))}
      </ul>

      {current
        ? <button className="btn subtle block" disabled>Current plan</button>
        : free
          ? <button className="btn outline block" onClick={onChoose}>Switch to Free</button>
          : <button className="btn primary block" onClick={onChoose}><Icon name="sparkle" size={17} />Upgrade to Pro</button>}
    </div>
  );
}

function Pricing({ user, onUpgrade, onDowngrade, onBack }) {
  const [billing, setBilling] = useStatePr('year');
  const cur = (user && user.plan) || 'free';

  return (
    <div className="pricing">
      <div className="pr-top">
        <button className="ghost-btn" onClick={onBack}><Icon name="arrowL" size={15} />Back</button>
      </div>

      <div className="pr-hero">
        <span className="lp-eyebrow">Plans</span>
        <h1>Simple pricing. Lift the limits when you’re ready.</h1>
        <p>Start free with two spaces. Upgrade to Pro for unlimited everything, item photos and sync across devices.</p>
        <div className="bill-toggle" role="group" aria-label="Billing period">
          <button className={billing === 'month' ? 'on' : ''} onClick={() => setBilling('month')}>Monthly</button>
          <button className={billing === 'year' ? 'on' : ''} onClick={() => setBilling('year')}>Yearly<span className="bt-save">−20%</span></button>
        </div>
      </div>

      <div className="plan-cards">
        <PlanCard plan={PLANS.free} billing={billing} current={cur === 'free'} onChoose={onDowngrade} />
        <PlanCard plan={PLANS.pro} billing={billing} current={cur === 'pro'} onChoose={() => onUpgrade(billing)} />
      </div>

      <div className="cmp">
        <div className="cmp-title">Everything compared</div>
        <table className="cmp-table">
          <thead>
            <tr><th>Feature</th><th>Free</th><th className="pro-col">Pro</th></tr>
          </thead>
          <tbody>
            {PLAN_FEATURES.map(f => (
              <tr key={f.key}>
                <td>{f.label}</td>
                <td className={PLANS.free[f.key] === false ? 'off' : ''}>{f.fmt(PLANS.free[f.key])}</td>
                <td className="pro-col">{f.fmt(PLANS.pro[f.key])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pr-faq">
        <div className="faq-q">
          <div className="fq-t">What happens to my data if I downgrade?</div>
          <div className="fq-d">Nothing is deleted. Spaces and items beyond the Free limits become read-only until you’re back under the cap or upgrade again.</div>
        </div>
        <div className="faq-q">
          <div className="fq-t">Can I cancel anytime?</div>
          <div className="fq-d">Yes — Pro is month-to-month or yearly. Cancel whenever; you keep Pro until the period ends.</div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Pricing });
