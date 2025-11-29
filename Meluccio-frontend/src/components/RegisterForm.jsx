// 📝 Componente Registrazione per Melo Chat
// Form di registrazione con validazione client-side e server-side

import { useState } from 'react';
import PropTypes from 'prop-types';

import { useAuth } from '../hooks/useAuth.jsx';

const RegisterForm = ({ onSuccess, onSwitchToLogin }) => {
  const { register, loading, error, clearError } = useAuth();
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    displayName: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Pulisci errori quando utente inizia a digitare
    if (error) clearError();
    if (validationErrors[name]) {
      setValidationErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validateForm = () => {
    const errors = {};

    // Username validation
    if (!formData.username.trim()) {
      errors.username = 'Username richiesto';
    } else if (formData.username.length < 3) {
      errors.username = 'Username deve essere di almeno 3 caratteri';
    } else if (!/^[a-zA-Z0-9_]+$/.test(formData.username)) {
      errors.username = 'Username può contenere solo lettere, numeri e underscore';
    }

    // Email validation
    if (!formData.email.trim()) {
      errors.email = 'Email richiesta';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Email non valida';
    }

    // Password validation
    if (!formData.password) {
      errors.password = 'Password richiesta';
    } else if (formData.password.length < 8) {
      errors.password = 'Password deve essere di almeno 8 caratteri';
    }

    // Confirm password validation
    if (!formData.confirmPassword) {
      errors.confirmPassword = 'Conferma password richiesta';
    } else if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = 'Le password non coincidono';
    }

    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    const result = await register(
      formData.username,
      formData.email,
      formData.password,
      formData.displayName || null
    );
    
    if (result.success && onSuccess) {
      onSuccess(result.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center sm:text-left">
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-600">
          <span aria-hidden>📝</span>
          Nuovo account
        </div>
        <p className="text-sm text-slate-500">
          Compila i campi richiesti per creare il tuo profilo Melo Chat.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          <span aria-hidden>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="username" className="mb-1 block text-sm font-medium text-slate-600">
            Username *
          </label>
          <input
            type="text"
            id="username"
            name="username"
            value={formData.username}
            onChange={handleChange}
            className={`w-full rounded-xl border px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
              validationErrors.username ? 'border-rose-300 focus:ring-rose-400' : 'border-slate-200'
            }`}
            placeholder="Il tuo username univoco"
            required
            disabled={loading}
          />
          {validationErrors.username && (
            <p className="mt-1 text-xs text-rose-500">{validationErrors.username}</p>
          )}
        </div>

        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-600">
            Email *
          </label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            className={`w-full rounded-xl border px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
              validationErrors.email ? 'border-rose-300 focus:ring-rose-400' : 'border-slate-200'
            }`}
            placeholder="la-tua-email@esempio.com"
            required
            disabled={loading}
          />
          {validationErrors.email && (
            <p className="mt-1 text-xs text-rose-500">{validationErrors.email}</p>
          )}
        </div>

        <div>
          <label htmlFor="displayName" className="mb-1 block text-sm font-medium text-slate-600">
            Nome display <span className="text-slate-400">(opzionale)</span>
          </label>
          <input
            type="text"
            id="displayName"
            name="displayName"
            value={formData.displayName}
            onChange={handleChange}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            placeholder="Come vuoi essere chiamato"
            disabled={loading}
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-600">
            Password *
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              className={`w-full rounded-xl border px-4 py-3 pr-12 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                validationErrors.password ? 'border-rose-300 focus:ring-rose-400' : 'border-slate-200'
              }`}
              placeholder="Almeno 8 caratteri"
              required
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
              disabled={loading}
            >
              {showPassword ? '🙈' : '👁️‍🗨️'}
            </button>
          </div>
          {validationErrors.password && (
            <p className="mt-1 text-xs text-rose-500">{validationErrors.password}</p>
          )}
        </div>

        <div>
          <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-slate-600">
            Conferma password *
          </label>
          <div className="relative">
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              className={`w-full rounded-xl border px-4 py-3 pr-12 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                validationErrors.confirmPassword ? 'border-rose-300 focus:ring-rose-400' : 'border-slate-200'
              }`}
              placeholder="Ripeti la password"
              required
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
              disabled={loading}
            >
              {showConfirmPassword ? '🙈' : '👁️‍🗨️'}
            </button>
          </div>
          {validationErrors.confirmPassword && (
            <p className="mt-1 text-xs text-rose-500">{validationErrors.confirmPassword}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
        >
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Registrando...
            </>
          ) : (
            <>
              <span aria-hidden>🚀</span>
              Registrati
            </>
          )}
        </button>
      </form>

      {onSwitchToLogin && (
        <div className="text-center text-sm text-slate-500">
          Hai già un account?
          {' '}
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="font-semibold text-indigo-500 hover:text-indigo-600"
            disabled={loading}
          >
            Accedi qui
          </button>
        </div>
      )}

      <p className="text-center text-xs text-slate-400">
        Registrandoti accetti i termini di servizio di Melo Chat.
      </p>
    </div>
  );
};

RegisterForm.propTypes = {
  onSuccess: PropTypes.func,
  onSwitchToLogin: PropTypes.func
};

export default RegisterForm;