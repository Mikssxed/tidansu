/* screens-landing.jsx — calm, minimal marketing landing.
   Matches the app: dark, hairlines, no gradients/shadows, same type & zone colors. */
const { useState: useStateLP } = React;

// a small static "look inside" illustration built from the app's own vocabulary
function HeroArt() {
  const shelves = [
    { color: 'blue',  name: 'Top shelf',  items: [['milk', 'Milk'], ['bowl', 'Leftovers'], ['bottle', 'Juice']] },
    { color: 'green', name: 'Middle',     items: [['egg', 'Eggs ×12'], ['cheese', 'Cheddar'], ['jar', 'Pickles']] },
    { color: 'amber', name: 'Door',       items: [['cheese', 'Butter'], ['jar', 'Ketchup']] },
  ];
  return (
    <div className="lp-art" aria-hidden="true">
      <div className="lp-art-head">
        <span className="sw"></span>
        <span className="nm">My fridge</span>
        <span className="ct">23 items · 4 shelves</span>
      </div>
      <div className="lp-art-shelves">
        {shelves.map((s, i) => (
          <div className={'lp-shelf z-' + s.color} key={i}>
            <div className="lp-shelf-name">{s.name}</div>
            <div className="lp-shelf-deck">
              {s.items.map(([ic, label], j) => (
                <span className="ichip sm" key={j}><Icon name={ic} size={13} />{label}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Landing({ onGetStarted, onSignIn, onPricing }) {
  const steps = [
    { icon: 'plus',  t: 'Add it fast',  d: 'Type “milk, top shelf ×2” — or scan a barcode. It lands in the right place.' },
    { icon: 'grid',  t: 'Lay it out',   d: 'Draw your shelves, drawers and cabinets once. See exactly where things sit.' },
    { icon: 'search', t: 'Always know', d: 'Search, group by shelf, and catch what’s about to expire before it’s gone.' },
  ];
  const features = [
    { icon: 'cabinet', t: 'Spaces for everything', d: 'Fridge, freezer, cellar, cabinets — each mapped its own way.' },
    { icon: 'layers',  t: 'A real layout', d: 'Levels, depth and walls. Open the door and look in, top-down or shelf by shelf.' },
    { icon: 'sparkle', t: 'Expiry that warns you', d: 'Soft nudges as dates approach. Nothing forgotten at the back.' },
  ];

  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="brand"><span className="mark"><Icon name="grid" size={14} /></span>storebook</div>
        <span className="spacer"></span>
        <nav className="lp-links">
          <button onClick={onPricing}>Pricing</button>
          <button onClick={onSignIn}>Sign in</button>
        </nav>
        <button className="btn primary lp-navcta" onClick={onGetStarted}>Get started</button>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-copy">
          <span className="lp-eyebrow">Spatial inventory</span>
          <h1>Know what’s on every shelf.</h1>
          <p>storebook maps your fridge, freezer, cabinets and cellar — so you always know what you have,
             where it sits, and what’s about to expire. No spreadsheets. No guessing.</p>
          <div className="lp-cta-row">
            <button className="btn primary" onClick={onGetStarted}>Get started — free<Icon name="arrowR" size={18} /></button>
            <button className="btn outline" onClick={onPricing}>See pricing</button>
          </div>
          <div className="lp-note"><Icon name="check" size={14} />Free for 2 spaces · no card needed</div>
        </div>
        <HeroArt />
      </section>

      <section className="lp-band">
        <div className="lp-steps">
          {steps.map((s, i) => (
            <div className="lp-step" key={i}>
              <span className="lp-step-ico"><Icon name={s.icon} size={19} /></span>
              <div className="lp-step-n">0{i + 1}</div>
              <div className="lp-step-t">{s.t}</div>
              <div className="lp-step-d">{s.d}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-features">
        {features.map((f, i) => (
          <div className="lp-feature" key={i}>
            <span className="lp-feature-ico"><Icon name={f.icon} size={20} /></span>
            <div className="lp-feature-t">{f.t}</div>
            <div className="lp-feature-d">{f.d}</div>
          </div>
        ))}
      </section>

      <section className="lp-pricing-teaser">
        <div className="lp-pt-copy">
          <h2>Start free. Upgrade when your kitchen grows.</h2>
          <p>Two spaces and fifty items are plenty to begin. When you’re mapping the whole
             house, Pro lifts every limit and adds photos &amp; sync.</p>
          <button className="btn outline" onClick={onPricing}>Compare plans<Icon name="arrowR" size={16} /></button>
        </div>
        <div className="lp-pt-cards">
          <div className="lp-pt-card">
            <div className="lp-pt-name">Free</div>
            <div className="lp-pt-price">$0</div>
            <div className="lp-pt-d">2 spaces · 50 items each</div>
          </div>
          <div className="lp-pt-card pro">
            <div className="lp-pt-name">Pro <span className="pro-badge">Pro</span></div>
            <div className="lp-pt-price">$5<span>/mo</span></div>
            <div className="lp-pt-d">Unlimited · photos · sync</div>
          </div>
        </div>
      </section>

      <section className="lp-final">
        <h2>Put everything in its place.</h2>
        <button className="btn primary" onClick={onGetStarted}>Get started — free<Icon name="arrowR" size={18} /></button>
      </section>

      <footer className="lp-foot">
        <div className="brand"><span className="mark"><Icon name="grid" size={12} /></span>storebook</div>
        <span className="spacer"></span>
        <span className="lp-foot-links">
          <button onClick={onPricing}>Pricing</button>
          <button onClick={onSignIn}>Sign in</button>
          <span className="faint">© 2026 storebook</span>
        </span>
      </footer>
    </div>
  );
}

Object.assign(window, { Landing });
