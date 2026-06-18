/* screens-auth.jsx — passwordless / magic-link sign in + register (mocked).
   enter email → "check your inbox" → simulated link opens → signed in. */
const { useState: useStateAuth } = React;

const looksLikeEmail = s => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim());

function Auth({ onAuthed, onBack }) {
  const [email, setEmail] = useStateAuth('');
  const [sent, setSent] = useStateAuth(false);

  const valid = looksLikeEmail(email);
  const send = () => { if (valid) setSent(true); };

  return (
    <div className="auth">
      <button className="auth-back ghost-btn" onClick={onBack}><Icon name="arrowL" size={15} />Back</button>

      <div className="auth-card">
        <div className="auth-brand"><span className="mark"><Icon name="grid" size={15} /></span>storebook</div>

        {!sent ? (
          <React.Fragment>
            <h1>Sign in or create your account</h1>
            <p className="auth-sub">No password to remember. We’ll email you a secure link — one tap and you’re in.</p>

            <label className="kicker auth-label">Email</label>
            <input className="name-field" type="email" autoFocus value={email}
                   onChange={e => setEmail(e.target.value)}
                   onKeyDown={e => e.key === 'Enter' && send()}
                   placeholder="you@email.com" style={{ fontSize: 16 }} />

            <button className="btn primary block auth-submit" disabled={!valid} onClick={send}>
              <Icon name="arrowR" size={18} />Send magic link
            </button>

            <div className="auth-fine"><Icon name="lock" size={13} />New here? The same link creates your account.</div>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <div className="auth-sent-ico"><Icon name="check" size={26} /></div>
            <h1>Check your inbox</h1>
            <p className="auth-sub">We sent a magic link to <b>{email.trim()}</b>. Tap it to finish signing in.</p>

            <button className="btn primary block auth-submit" onClick={() => onAuthed(email.trim())}>
              Open the link <span className="auth-demo">demo</span>
            </button>
            <div className="auth-resend">
              <button onClick={() => setSent(false)}>Use a different email</button>
              <span className="faint">·</span>
              <button onClick={() => {}}>Resend</button>
            </div>
          </React.Fragment>
        )}
      </div>

      <div className="auth-legal faint">By continuing you agree to the Terms &amp; Privacy Policy.</div>
    </div>
  );
}

Object.assign(window, { Auth });
