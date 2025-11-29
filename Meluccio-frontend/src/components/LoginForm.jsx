// 🔐 Form di login per Melo Chat con UI moderna Tailwind

import { useState } from 'react';
import PropTypes from 'prop-types';

import { useAuth } from '../hooks/useAuth.jsx';

const LoginForm = ({ onSuccess, onSwitchToRegister }) => {
  const { login, loading, error, clearError } = useAuth();
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);

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

  return (
    <div className="space-y-6">
      <div className="space-y-3 text-center sm:text-left">
        <div className="inline-flex items-center gap-2 bg-indigo-100 text-indigo-600 text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wide">
          <span aria-hidden>🔒</span>
          Accesso protetto
        </div>
        <p className="text-sm text-slate-500">
          Inserisci le tue credenziali per continuare nel tuo studio virtuale.
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
    </div>
  );
};

LoginForm.propTypes = {
  onSuccess: PropTypes.func,
  onSwitchToRegister: PropTypes.func
};

export default LoginForm;