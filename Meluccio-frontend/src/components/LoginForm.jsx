// 🔐 Form di login per Melo Chat con UI moderna Tailwind

import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';

import { useAuth } from '../hooks/useAuth.jsx';
import { findBestUrl } from '../utils/connection.js';

const PasswordResetModal = ({ isOpen, onClose, prefillToken, autoVerify }) => {
  const [step, setStep] = useState('request');
  const [mode, setMode] = useState('password'); // 'password' | 'username'
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState('');
  const [debugInfo, setDebugInfo] = useState(null);
  const [pendingAutoVerify, setPendingAutoVerify] = useState(false);

  // Ripristina lo stato interno ad ogni apertura
  useEffect(() => {
    if (isOpen) {
      const hasPrefill = Boolean(prefillToken);
      setStep(hasPrefill ? 'verify' : 'request');
      setMode(hasPrefill ? 'password' : 'password');
      setEmail('');
      setToken(prefillToken || '');
      setNewPassword('');
      setLoading(false);
      setError(null);
      setMessage(hasPrefill ? 'Abbiamo precompilato il token ricevuto via email. Confermalo qui sotto per impostare una nuova password.' : '');
      setDebugInfo(null);
      setPendingAutoVerify(hasPrefill && autoVerify);
    } else {
      setPendingAutoVerify(false);
    }
  }, [isOpen, prefillToken, autoVerify]);

  useEffect(() => {
    if (!isOpen || !pendingAutoVerify || !token.trim()) {
      return;
    }

    const run = async () => {
      await performVerify(token.trim());
    };

    run().finally(() => {
      setPendingAutoVerify(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, pendingAutoVerify, token]);

  if (!isOpen) {
    return null;
  }

  const handleRequest = async (event) => {
    event.preventDefault();
    if (!email.trim()) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const baseUrl = await findBestUrl();
      let response;
      if (mode === 'username') {
        response = await fetch(`${baseUrl}/api/auth/forgot-username`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ email: email.trim() })
        });
      } else {
        response = await fetch(`${baseUrl}/api/auth/forgot-password`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ email: email.trim() })
        });
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || 'Impossibile richiedere il reset della password.');
      }

      if (mode === 'username') {
        const serverMessage = data?.message || "Se l'email è associata a un account, riceverai il tuo username.";
        setMessage(serverMessage);
        setStep('success');
      } else {
        const serverMessage = data?.message || "Se i dati forniti sono corretti riceverai un'email con le istruzioni per il reset.";
        setMessage(`${serverMessage} Copia il token ricevuto e incollalo qui sotto per confermarlo.`);
        if (data?.debug?.resetToken) {
          setToken(data.debug.resetToken);
          setDebugInfo(data.debug);
        }
        setStep('verify');
      }
    } catch (requestError) {
      console.error('Errore richiesta reset password:', requestError);
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const performVerify = async (value) => {
    try {
      setLoading(true);
      setError(null);
      const baseUrl = await findBestUrl();
      const response = await fetch(`${baseUrl}/api/auth/reset-password/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token: value })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.valid) {
        throw new Error(data?.error || 'Token non valido o scaduto.');
      }

      setMessage('Token verificato! Ora imposta una nuova password.');
      setStep('reset');
      return true;
    } catch (verifyError) {
      console.error('Errore verifica token reset password:', verifyError);
      setError(verifyError.message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (event) => {
    event.preventDefault();
    if (!token.trim()) {
      return;
    }

    await performVerify(token.trim());
  };

  const handleReset = async (event) => {
    event.preventDefault();
    if (!token.trim() || newPassword.length < 8) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const baseUrl = await findBestUrl();
      const response = await fetch(`${baseUrl}/api/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token: token.trim(), new_password: newPassword })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || 'Impossibile reimpostare la password.');
      }

      setMessage(data?.message || 'Password reimpostata con successo! Ora puoi effettuare il login.');
      setStep('success');
    } catch (resetError) {
      console.error('Errore reset password:', resetError);
      setError(resetError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Recupera credenziali</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Chiudi"
          >
            ✕
          </button>
        </div>

        <p className="mt-2 text-sm text-slate-500">
          Scegli cosa recuperare: invieremo le informazioni all&apos;email associata all&apos;account.
        </p>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
            <span aria-hidden>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {message && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            <span aria-hidden>✅</span>
            <span>{message}</span>
          </div>
        )}

        {debugInfo && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            <p className="font-semibold">Debug token</p>
            <p className="break-words text-xs text-amber-700">{debugInfo.resetToken}</p>
            <a
              href={debugInfo.resetLink}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-600 hover:text-amber-700"
            >
              Apri link di debug →
            </a>
          </div>
        )}

        {step === 'request' && (
          <form onSubmit={handleRequest} className="mt-6 space-y-4">
            <div className="flex gap-3 text-sm">
              <label className={`flex flex-1 items-center gap-2 rounded-xl border px-3 py-2 transition ${mode === 'password' ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600'}`}>
                <input
                  type="radio"
                  name="recovery-mode"
                  value="password"
                  checked={mode === 'password'}
                  onChange={() => setMode('password')}
                  className="accent-indigo-500"
                />
                Recupera password
              </label>
              <label className={`flex flex-1 items-center gap-2 rounded-xl border px-3 py-2 transition ${mode === 'username' ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600'}`}>
                <input
                  type="radio"
                  name="recovery-mode"
                  value="username"
                  checked={mode === 'username'}
                  onChange={() => setMode('username')}
                  className="accent-indigo-500"
                />
                Recupera username
              </label>
            </div>
            <div className="space-y-2">
              <label htmlFor="reset-email" className="text-sm font-medium text-slate-600">
                Email associata all&apos;account
              </label>
              <input
                id="reset-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                placeholder="esempio@email.com"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !email.trim()}
              className={`w-full rounded-xl px-4 py-3 font-semibold transition ${
                loading || !email.trim()
                  ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                  : 'bg-indigo-500 text-white hover:bg-indigo-600'
              }`}
            >
              {loading
                ? 'Invio in corso...'
                : mode === 'username'
                  ? 'Invia promemoria username'
                  : 'Invia link e token'}
            </button>
          </form>
        )}

        {step === 'verify' && mode === 'password' && (
          <form onSubmit={handleVerify} className="mt-6 space-y-4">
            <div className="space-y-2">
              <label htmlFor="reset-token" className="text-sm font-medium text-slate-600">
                Inserisci il token ricevuto
              </label>
              <input
                id="reset-token"
                type="text"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Incolla il token di reset"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <button
                type="button"
                onClick={() => setStep('request')}
                className="font-medium text-slate-500 hover:text-slate-700"
              >
                ← Torna indietro
              </button>
              <span>
                Non trovi il token? Controlla anche la cartella spam.
              </span>
            </div>
            <button
              type="submit"
              disabled={loading || !token.trim()}
              className={`w-full rounded-xl px-4 py-3 font-semibold transition ${
                loading || !token.trim()
                  ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                  : 'bg-indigo-500 text-white hover:bg-indigo-600'
              }`}
            >
              {loading ? 'Verifica in corso...' : 'Verifica token'}
            </button>
          </form>
        )}

        {step === 'reset' && mode === 'password' && (
          <form onSubmit={handleReset} className="mt-6 space-y-4">
            <div className="space-y-2">
              <label htmlFor="reset-password" className="text-sm font-medium text-slate-600">
                Nuova password
              </label>
              <input
                id="reset-password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                minLength={8}
                placeholder="Almeno 8 caratteri"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <button
              type="submit"
              disabled={loading || newPassword.length < 8}
              className={`w-full rounded-xl px-4 py-3 font-semibold transition ${
                loading || newPassword.length < 8
                  ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                  : 'bg-emerald-500 text-white hover:bg-emerald-600'
              }`}
            >
              {loading ? 'Aggiornamento in corso...' : 'Aggiorna password'}
            </button>
          </form>
        )}

        {step === 'success' && (
          <div className="mt-6 space-y-4 text-sm text-slate-600">
            <p>
              {mode === 'username'
                ? 'Controlla la tua email: troverai il tuo username registrato.'
                : 'La tua password è stata aggiornata. Puoi chiudere questa finestra e tornare al login.'}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl bg-indigo-500 px-4 py-3 font-semibold text-white transition hover:bg-indigo-600"
            >
              Torna al login
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

PasswordResetModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  prefillToken: PropTypes.string,
  autoVerify: PropTypes.bool
};

const LoginForm = ({ onSuccess, onSwitchToRegister }) => {
  const { login, loading, error, clearError } = useAuth();
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetModalConfig, setResetModalConfig] = useState({ prefillToken: '', autoVerify: false });

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));

    if (error) {
      clearError();
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!formData.username.trim() || !formData.password.trim()) {
      return;
    }

    const result = await login(formData.username.trim(), formData.password);
    if (result.success && onSuccess) {
      onSuccess(result.user);
    }
  };

  useEffect(() => {
    try {
      const currentUrl = new URL(window.location.href);
      const tokenParam = currentUrl.searchParams.get('token');
      const isResetRoute = currentUrl.pathname.includes('reset-password');

      if (tokenParam || isResetRoute) {
        setResetModalConfig({
          prefillToken: tokenParam || '',
          autoVerify: Boolean(tokenParam)
        });
        setShowResetModal(true);

        currentUrl.searchParams.delete('token');
        const sanitizedSearch = currentUrl.searchParams.toString();
        const newUrl = `/${sanitizedSearch ? `?${sanitizedSearch}` : ''}`;
        window.history.replaceState({}, '', newUrl);
      }
    } catch (urlError) {
      console.error('Errore nel parsing URL reset password:', urlError);
    }
  }, []);

  return (
    <div className="space-y-4">
      <div className="text-left leading-normal">
        <p className="text-sm text-slate-600">
          Accedi con le credenziali registrate.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          <span aria-hidden>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="username" className="text-sm font-medium text-slate-600">
            Username
          </label>
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            value={formData.username}
            onChange={handleChange}
            placeholder="Il tuo username"
            disabled={loading}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium text-slate-600">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={formData.password}
              onChange={handleChange}
              placeholder="La tua password"
              disabled={loading}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pr-12 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
              disabled={loading}
            >
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>
          <div className="flex justify-end text-xs">
            <button
              type="button"
              onClick={() => {
                setResetModalConfig({ prefillToken: '', autoVerify: false });
                setShowResetModal(true);
              }}
              className="font-medium text-indigo-500 hover:text-indigo-600"
              disabled={loading}
            >
              Recupera credenziali
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !formData.username.trim() || !formData.password.trim()}
          className={`w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold transition-all ${
            loading || !formData.username.trim() || !formData.password.trim()
              ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
              : 'bg-indigo-500 hover:bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
          }`}
        >
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Accesso in corso...
            </>
          ) : (
            <>
              <span aria-hidden>🎧</span>
              Accedi ora
            </>
          )}
        </button>
      </form>

      {onSwitchToRegister && (
        <div className="text-center text-sm text-slate-500">
          Non hai ancora un account?
          {' '}
          <button
            type="button"
            onClick={onSwitchToRegister}
            className="font-semibold text-indigo-500 hover:text-indigo-600"
            disabled={loading}
          >
            Registrati gratuitamente
          </button>
        </div>
      )}

        <PasswordResetModal
          isOpen={showResetModal}
          onClose={() => {
            setShowResetModal(false);
            setResetModalConfig({ prefillToken: '', autoVerify: false });
          }}
          prefillToken={resetModalConfig.prefillToken}
          autoVerify={resetModalConfig.autoVerify}
        />
    </div>
  );
};

LoginForm.propTypes = {
  onSuccess: PropTypes.func,
  onSwitchToRegister: PropTypes.func
};

export default LoginForm;