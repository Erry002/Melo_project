// 👤 Pannello profilo utente per Melo Chat

import { useState } from 'react';
import PropTypes from 'prop-types';

import { useAuth } from '../hooks/useAuth.jsx';

const AVATAR_ACCEPT = 'image/png, image/jpeg, image/webp';

const resolveAvatarSrc = (avatar) => {
  if (!avatar) return null;
  if (/^https?:\/\//i.test(avatar)) return avatar;
  if (avatar.startsWith('/')) return avatar;
  return `/${avatar}`;
};

const UserProfile = ({ onClose, onLogout }) => {
  const { user, updateProfile, changePassword, uploadAvatar, logout, loading, error, clearError } = useAuth();
  const [profileData, setProfileData] = useState({
    display_name: user?.display_name || '',
    email: user?.email || ''
  });
  const [passwordData, setPasswordData] = useState({
    current_password: '',
    new_password: '',
    confirm_password: ''
  });
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar ? `${resolveAvatarSrc(user.avatar)}?t=${Date.now()}` : null);
  const [profileMessage, setProfileMessage] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');

  const resetFeedback = () => {
    setProfileMessage('');
    setPasswordMessage('');
    if (error) {
      clearError();
    }
  };

  const handleProfileChange = (event) => {
    const { name, value } = event.target;
    resetFeedback();
    setProfileData((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleProfileSubmit = async (event) => {
    event.preventDefault();
    resetFeedback();
    const result = await updateProfile(profileData);
    if (result.success) {
      setProfileMessage('Profilo aggiornato con successo!');
    } else if (result.error) {
      setProfileMessage(result.error);
    }
  };

  const handlePasswordChange = (event) => {
    const { name, value } = event.target;
    resetFeedback();
    setPasswordData((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    resetFeedback();

    if (!passwordData.current_password || !passwordData.new_password) {
      setPasswordMessage('Inserisci la password attuale e quella nuova.');
      return;
    }

    if (passwordData.new_password.length < 8) {
      setPasswordMessage('La nuova password deve avere almeno 8 caratteri.');
      return;
    }

    if (passwordData.new_password !== passwordData.confirm_password) {
      setPasswordMessage('Le password non coincidono.');
      return;
    }

    const result = await changePassword({
      current_password: passwordData.current_password,
      new_password: passwordData.new_password
    });

    if (result.success) {
      setPasswordMessage('Password aggiornata con successo!');
      setPasswordData({ current_password: '', new_password: '', confirm_password: '' });
    } else if (result.error) {
      setPasswordMessage(result.error);
    }
  };

  const handleAvatarChange = async (event) => {
    resetFeedback();
    const file = event.target.files?.[0];
    if (!file) return;

    if (!AVATAR_ACCEPT.split(',').includes(file.type)) {
      setProfileMessage('Formato non supportato. Usa PNG, JPG o WEBP.');
      return;
    }

    const localPreview = URL.createObjectURL(file);
    setAvatarPreview(localPreview);

    const result = await uploadAvatar(file);
    if (result.success && result.avatar) {
      setProfileMessage('Avatar aggiornato correttamente!');
      setAvatarPreview(`${resolveAvatarSrc(result.avatar)}?t=${Date.now()}`);
    } else if (result.error) {
      setProfileMessage(result.error);
    }
  };

  const handleLogoutClick = async () => {
    resetFeedback();
    if (onLogout) {
      await onLogout();
    } else {
      await logout();
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur flex items-center justify-center z-50 px-4">
      <div className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-xl"
          aria-label="Chiudi profilo"
        >
          ✕
        </button>

        <div className="grid lg:grid-cols-3">
          <aside className="bg-gradient-to-br from-indigo-600 via-purple-600 to-blue-600 text-white p-8">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="relative">
                <div className="w-28 h-28 rounded-full overflow-hidden ring-4 ring-white/40 shadow-lg">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-white/20 flex items-center justify-center text-4xl">
                      {user?.display_name?.[0] || user?.username?.[0] || 'M'}
                    </div>
                  )}
                </div>
                <label
                  htmlFor="avatar-upload"
                  className="absolute -bottom-2 -right-2 bg-white text-indigo-600 rounded-full p-2 shadow cursor-pointer hover:bg-indigo-50"
                >
                  📸
                </label>
                <input
                  id="avatar-upload"
                  type="file"
                  accept={AVATAR_ACCEPT}
                  onChange={handleAvatarChange}
                  className="hidden"
                  disabled={loading}
                />
              </div>

              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-white/70">Profilo</p>
                <h2 className="text-2xl font-bold">{user?.display_name || user?.username}</h2>
                <p className="text-white/70 text-sm">ID utente: {user?.id || '—'}</p>
              </div>

              <div className="w-full text-left space-y-2 text-sm text-white/80">
                <p><span className="font-semibold text-white">Username:</span> {user?.username}</p>
                <p><span className="font-semibold text-white">Email:</span> {user?.email || 'Non impostata'}</p>
                <p><span className="font-semibold text-white">Ultimo accesso:</span> {user?.last_login || '—'}</p>
              </div>
            </div>
          </aside>

          <div className="lg:col-span-2 p-8 space-y-8">
            <section className="bg-slate-50 rounded-2xl border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Aggiorna informazioni profilo</h3>
              <form onSubmit={handleProfileSubmit} className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="display_name" className="text-sm font-medium text-slate-600">Nome visualizzato</label>
                    <input
                      id="display_name"
                      name="display_name"
                      type="text"
                      value={profileData.display_name}
                      onChange={handleProfileChange}
                      placeholder="Il nome mostrato agli altri utenti"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="email" className="text-sm font-medium text-slate-600">Email</label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      value={profileData.email}
                      onChange={handleProfileChange}
                      placeholder="aggiorna la tua email"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                      disabled={loading}
                    />
                  </div>
                </div>

                {profileMessage && (
                  <div className="text-sm text-emerald-600 bg-emerald-100 border border-emerald-200 px-4 py-2 rounded-xl">
                    {profileMessage}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className={`px-6 py-3 rounded-xl font-semibold transition ${
                    loading
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      : 'bg-indigo-500 hover:bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                  }`}
                >
                  Salva modifiche
                </button>
              </form>
            </section>

            <section className="bg-slate-50 rounded-2xl border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Cambio password</h3>
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="current_password" className="text-sm font-medium text-slate-600">Password attuale</label>
                    <input
                      id="current_password"
                      name="current_password"
                      type="password"
                      value={passwordData.current_password}
                      onChange={handlePasswordChange}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="new_password" className="text-sm font-medium text-slate-600">Nuova password</label>
                    <input
                      id="new_password"
                      name="new_password"
                      type="password"
                      value={passwordData.new_password}
                      onChange={handlePasswordChange}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label htmlFor="confirm_password" className="text-sm font-medium text-slate-600">Conferma password</label>
                    <input
                      id="confirm_password"
                      name="confirm_password"
                      type="password"
                      value={passwordData.confirm_password}
                      onChange={handlePasswordChange}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                      disabled={loading}
                    />
                  </div>
                </div>

                {(passwordMessage || error) && (
                  <div className={`text-sm px-4 py-2 rounded-xl border ${
                    (passwordMessage && passwordMessage.includes('successo')) || (!passwordMessage && !error)
                      ? 'bg-emerald-100 border-emerald-200 text-emerald-700'
                      : 'bg-rose-100 border-rose-200 text-rose-600'
                  }`}
                  >
                    {passwordMessage || error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className={`px-6 py-3 rounded-xl font-semibold transition ${
                    loading
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      : 'bg-purple-500 hover:bg-purple-600 text-white shadow-lg shadow-purple-500/30'
                  }`}
                >
                  Aggiorna password
                </button>
              </form>
            </section>

            <section className="bg-slate-50 rounded-2xl border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-2">Sessione</h3>
              <p className="text-sm text-slate-500 mb-4">
                Esci dal tuo account su questo dispositivo.
              </p>
              <button
                type="button"
                onClick={handleLogoutClick}
                disabled={loading}
                className={`px-6 py-3 rounded-xl font-semibold transition ${
                  loading
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    : 'bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/30'
                }`}
              >
                Logout
              </button>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

UserProfile.propTypes = {
  onClose: PropTypes.func.isRequired,
  onLogout: PropTypes.func
};

export default UserProfile;
