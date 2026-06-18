/* screens-onboarding.jsx — 3-step onboarding: type -> complexity -> confirm */
const { useState: useStateOB } = React;

const COMPLEXITY = [
  { id: 'simple',   t: 'Simple', d: 'Just shelves in a column. No drawing — straight to your contents.',
    viz: [1, 1, 1] },
  { id: 'twodoors', t: 'Two doors side by side', d: 'Two columns, like a side-by-side fridge.',
    viz: 'cols' },
  { id: 'draw',     t: "I'll draw my own layout", d: 'Open the full canvas editor and place zones freely.',
    viz: 'draw', advanced: true },
];

const DEFAULT_NAME = {
  fridge: 'My fridge', freezer: 'My freezer', cellar: 'My cellar',
  cabinet: 'My cabinet', list: 'My list', other: 'My space',
};

function StepBar({ step }) {
  return (
    <div className="steps">
      {[1, 2, 3].map(n => (
        <div key={n} className={'seg-bar ' + (n < step ? 'done' : n === step ? 'active' : '')}><i></i></div>
      ))}
      <span className="step-label">Step {step} of 3</span>
    </div>
  );
}

function ComplexityViz({ kind, viz }) {
  if (viz === 'cols') return (
    <div className="viz"><i style={{ flex: 1 }}></i><i style={{ flex: 1 }}></i></div>
  );
  if (viz === 'draw') return (
    <div className="viz">
      <i style={{ flex: 2, alignSelf: 'flex-start', height: '60%' }}></i>
      <i style={{ flex: 1, alignSelf: 'flex-end', height: '75%' }}></i>
    </div>
  );
  return (
    <div className="viz" style={{ flexDirection: 'column' }}>
      <i style={{ flex: 1 }}></i><i style={{ flex: 1 }}></i><i style={{ flex: 1 }}></i>
    </div>
  );
}

function Onboarding({ onComplete, onCancel }) {
  const [step, setStep] = useStateOB(1);
  const [type, setType] = useStateOB(null);
  const [complexity, setComplexity] = useStateOB('simple');
  const [name, setName] = useStateOB('');

  const zones = type ? buildZones(type) : [];
  const noun = SPACE_NOUN[type] || 'Shelf';

  function chooseType(id) {
    setType(id);
    setName(DEFAULT_NAME[id] || 'My space');
    setStep(2);
  }
  function finish() {
    const space = seedForType(type, name || DEFAULT_NAME[type], complexity);
    onComplete(space);
  }

  return (
    <div className="ob">
      <StepBar step={step} />

      {step === 1 && (
        <React.Fragment>
          {onCancel && (
            <button className="ghost-btn ob-cancel" onClick={onCancel}><Icon name="arrowL" size={15} />Back to spaces</button>
          )}
          <h1>What do you want to organize?</h1>
          <p className="sub">Pick a space. We’ll set up sensible shelves for you automatically — you can rename or rearrange them anytime.</p>
          <div className="tiles">
            {SPACE_TYPES.map(s => (
              <button key={s.id} className={'tile' + (type === s.id ? ' on' : '')} onClick={() => chooseType(s.id)}>
                <span className="ico"><Icon name={s.icon} size={20} /></span>
                <span className="t">{s.title}</span>
                <span className="d">{s.desc}</span>
              </button>
            ))}
          </div>
        </React.Fragment>
      )}

      {step === 2 && (
        <React.Fragment>
          <h1>How complex is the layout?</h1>
          <p className="sub">Most spaces are simple. You can always switch to a richer layout later — nothing you add now is lost.</p>
          <div className="opts">
            {COMPLEXITY.map(o => (
              <button key={o.id} className={'opt' + (complexity === o.id ? ' on' : '')} onClick={() => setComplexity(o.id)}>
                <span className="radio"></span>
                <span className="body">
                  <span className="t">{o.t} {o.advanced && <span className="pro-badge" style={{ marginLeft: 6 }}>Advanced</span>}</span>
                  <span className="d">{o.d}</span>
                </span>
                <ComplexityViz viz={o.viz} />
              </button>
            ))}
          </div>
          <div className="ob-foot">
            <button className="iconbtn" onClick={() => setStep(1)} aria-label="Back"><Icon name="arrowL" size={18} /></button>
            <button className="btn primary" style={{ flex: 1 }} onClick={() => setStep(3)}>Continue<Icon name="arrowR" size={18} /></button>
          </div>
        </React.Fragment>
      )}

      {step === 3 && (
        <React.Fragment>
          <h1>Here’s your {type === 'list' ? 'list' : 'space'}</h1>
          <p className="sub">We numbered the shelves from the top. Names are optional — “{noun} 1”, “{noun} 2”… stay consistent even if you rename some.</p>

          <label className="kicker" style={{ marginBottom: 8, display: 'block' }}>Name</label>
          <input className="name-field" value={name} onChange={e => setName(e.target.value)}
                 placeholder={DEFAULT_NAME[type]} style={{ marginBottom: 22 }} />

          {type !== 'list' && (
            <React.Fragment>
              <label className="kicker" style={{ marginBottom: 10, display: 'block' }}>
                {zones.length} zones, ready to fill
              </label>
              <div className="zone-preview">
                {zones.map(z => (
                  <div key={z.id} className={'zp z-' + z.color}>
                    <span className="sw"></span>
                    <span className="nm">{zoneName(z, type)}</span>
                    <span className="meta">
                      {z.floor ? 'plain list' : z.hasDepth ? 'front / back' : `${z.gridCols} slots`}
                      {z.label && ' · custom name'}
                    </span>
                  </div>
                ))}
              </div>
            </React.Fragment>
          )}

          <div className="ob-foot">
            <button className="iconbtn" onClick={() => setStep(2)} aria-label="Back"><Icon name="arrowL" size={18} /></button>
            <button className="btn primary" style={{ flex: 1 }} onClick={finish}>Start adding items<Icon name="arrowR" size={18} /></button>
          </div>
        </React.Fragment>
      )}
    </div>
  );
}

// build a fresh (mostly empty) space for a chosen type; fridge gets a couple of demo items
function seedForType(type, name, complexity) {
  let space;
  if (type === 'fridge') {
    space = seedFridge();
    space.name = name;
  } else {
    space = {
      id: uid('space'), name, type, viewMode: 'list',
      canvasMode: 'columns', layoutColumns: 1, columnLabels: null,
      zones: buildZones(type), items: [],
    };
  }
  applyComplexity(space, complexity);
  space.viewMode = complexity === 'draw' ? 'grid' : 'list';
  return space;
}

Object.assign(window, { Onboarding });
