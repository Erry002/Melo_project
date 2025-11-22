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
    <div className="max-w-md mx-auto bg-slate-900 rounded-3xl shadow-xl border border-slate-700/60 p-8 text-white">
      <div className="text-center mb-8 space-y-2">
        <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/30 text-indigo-200 text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wide">
          <span>🔒</span> Accesso protetto
        </div>
        <h2 className="text-3xl font-bold tracking-tight">Bentornato su Melo Chat</h2>
        <p className="text-slate-300 text-sm">
          Inserisci le tue credenziali per continuare nel tuo studio virtuale.
        </p>
      </div>

      {error && (
        <div className="mb-5 bg-rose-500/10 border border-rose-400/60 text-rose-200 text-sm px-4 py-3 rounded-xl flex items-start gap-2">
          <span aria-hidden>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <label htmlFor="username" className="text-sm font-medium text-slate-200">
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
            className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium text-slate-200">
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
              className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200"
              disabled={loading}
            >
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !formData.username.trim() || !formData.password.trim()}
          className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all ${
            loading || !formData.username.trim() || !formData.password.trim()
              ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
              : 'bg-indigo-500 hover:bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
          }`}
        >
          {loading ? (
            <>
              <span className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Accesso in corso...
            </>
          ) : (
            <>
              <span>🎧</span>
              Accedi ora
            </>
          )}
        </button>
      </form>

      <div className="mt-6 text-center text-sm text-slate-400">
        Non hai ancora un account?
        {' '}
        <button
          type="button"
          onClick={onSwitchToRegister}
          className="text-indigo-300 hover:text-indigo-200 font-semibold"
          disabled={loading}
        >
          Registrati gratuitamente
        </button>
      </div>
    </div>
  );
};

LoginForm.propTypes = {
  onSuccess: PropTypes.func,
  onSwitchToRegister: PropTypes.func
};

export default LoginForm;