import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';

const MIN_DISTANCE = 12;
const MENU_BASE_WIDTH = 220;
const MENU_BASE_HEIGHT = 200;

const UserContextMenu = ({
  visible,
  position,
  targetUser,
  onClose,
  onInvite,
  onRemove,
  onCreateSubchannel,
  onAssignRole,
  roles,
  canInvite,
  canRemove,
  canCreateSubchannel,
  canAssignRole,
  currentRoleId,
  isSelf
}) => {
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const [showRoles, setShowRoles] = useState(false);

  useEffect(() => {
    if (!visible) {
      setShowRoles(false);
    }
  }, [visible, targetUser?.userId]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const handleClickOutside = () => {
      onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('click', handleClickOutside);
    window.addEventListener('contextmenu', handleClickOutside);
    window.addEventListener('scroll', handleClickOutside, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('click', handleClickOutside);
      window.removeEventListener('contextmenu', handleClickOutside);
      window.removeEventListener('scroll', handleClickOutside, true);
    };
  }, [visible, onClose]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const next = { ...position };
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (next.x + MENU_BASE_WIDTH > viewportWidth) {
      next.x = Math.max(MIN_DISTANCE, viewportWidth - MENU_BASE_WIDTH);
    } else {
      next.x = Math.max(MIN_DISTANCE, next.x);
    }

    if (next.y + MENU_BASE_HEIGHT > viewportHeight) {
      next.y = Math.max(MIN_DISTANCE, viewportHeight - MENU_BASE_HEIGHT);
    } else {
      next.y = Math.max(MIN_DISTANCE, next.y);
    }

    setAdjustedPosition(next);
  }, [position, visible]);

  const availableRoles = useMemo(() => (
    Array.isArray(roles) ? roles.sort((a, b) => a.priority - b.priority) : []
  ), [roles]);

  if (!visible || !targetUser) {
    return null;
  }

  const hasUserId = Boolean(targetUser.userId);

  const handleInvite = () => {
    onInvite?.(targetUser);
    onClose();
  };

  const handleRemove = () => {
    onRemove?.(targetUser);
    onClose();
  };

  const handleCreateSub = () => {
    onCreateSubchannel?.(targetUser);
    onClose();
  };

  const handleRoleSelect = (roleId) => {
    onAssignRole?.(targetUser, roleId);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-40"
      aria-hidden={!visible}
    >
      <div
        className="absolute z-50 w-56 rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
        style={{
          top: adjustedPosition.y,
          left: adjustedPosition.x
        }}
        role="menu"
        aria-label={`Azioni per ${targetUser.displayName || targetUser.username || 'utente'}`}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose();
        }}
      >
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70">
          <p className="text-xs uppercase tracking-wide text-slate-400">Utente selezionato</p>
          <p className="text-sm font-semibold text-slate-700 truncate">
            {targetUser.displayName || targetUser.username || targetUser.socketId}
          </p>
          {targetUser.roleName && (
            <p className="text-xs text-indigo-500 mt-1">
              Ruolo: {targetUser.roleName}
            </p>
          )}
        </div>

        <div className="py-1">
          <button
            type="button"
            className="w-full text-left px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 disabled:text-slate-300 disabled:cursor-not-allowed"
            onClick={handleInvite}
            disabled={!canInvite}
          >
            Invia richiesta amicizia (presto)
          </button>

          <button
            type="button"
            className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-indigo-50 disabled:text-slate-300 disabled:cursor-not-allowed"
            onClick={() => setShowRoles((prev) => !prev)}
            disabled={!canAssignRole || !hasUserId}
          >
            {showRoles ? 'Chiudi ruoli' : 'Imposta ruolo'}
          </button>

          {showRoles && (
            <div className="max-h-48 overflow-y-auto border-t border-slate-100">
              {availableRoles.length === 0 && (
                <p className="px-4 py-3 text-xs text-slate-400">Nessun ruolo disponibile.</p>
              )}
              {availableRoles.map((role) => {
                const isActive = role.id === currentRoleId;
                return (
                  <button
                    key={role.id}
                    type="button"
                    className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                      isActive
                        ? 'bg-indigo-500 text-white'
                        : 'text-slate-600 hover:bg-indigo-50'
                    }`}
                    onClick={() => handleRoleSelect(role.id)}
                  >
                    <span className="font-medium">{role.name}</span>
                    {role.description && (
                      <span className="block text-xs text-slate-400 mt-0.5">{role.description}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <button
            type="button"
            className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-indigo-50 disabled:text-slate-300 disabled:cursor-not-allowed"
            onClick={handleCreateSub}
            disabled={!canCreateSubchannel || !hasUserId}
          >
            Crea sottocanale
          </button>

          <button
            type="button"
            className="w-full text-left px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 disabled:text-slate-300 disabled:cursor-not-allowed"
            onClick={handleRemove}
            disabled={!canRemove || isSelf || !hasUserId}
          >
            Rimuovi dalla stanza
          </button>
        </div>
      </div>
    </div>
  );
};

UserContextMenu.propTypes = {
  visible: PropTypes.bool,
  position: PropTypes.shape({
    x: PropTypes.number,
    y: PropTypes.number
  }).isRequired,
  targetUser: PropTypes.shape({
    socketId: PropTypes.string,
    username: PropTypes.string,
    displayName: PropTypes.string,
    userId: PropTypes.number,
    roleId: PropTypes.string,
    roleKey: PropTypes.string,
    roleName: PropTypes.string
  }),
  onClose: PropTypes.func.isRequired,
  onInvite: PropTypes.func,
  onRemove: PropTypes.func,
  onCreateSubchannel: PropTypes.func,
  onAssignRole: PropTypes.func,
  roles: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    description: PropTypes.string,
    priority: PropTypes.number
  })),
  canInvite: PropTypes.bool,
  canRemove: PropTypes.bool,
  canCreateSubchannel: PropTypes.bool,
  canAssignRole: PropTypes.bool,
  currentRoleId: PropTypes.string,
  isSelf: PropTypes.bool
};

UserContextMenu.defaultProps = {
  visible: false,
  targetUser: null,
  onInvite: null,
  onRemove: null,
  onCreateSubchannel: null,
  onAssignRole: null,
  roles: [],
  canInvite: false,
  canRemove: false,
  canCreateSubchannel: false,
  canAssignRole: false,
  currentRoleId: null,
  isSelf: false
};

export default UserContextMenu;
