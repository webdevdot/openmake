import { usePresenceStore } from '../../store/presence.js';

export function PresenceAvatars() {
  const remoteStates = usePresenceStore((s) => s.remoteStates);
  const users = Object.values(remoteStates);
  if (users.length === 0) return null;

  return (
    <div className="flex -space-x-2" data-testid="presence-avatars">
      {users.map((u) => (
        <div
          key={u.userId}
          title={u.name}
          className="flex h-6 w-6 items-center justify-center rounded-full border-2 text-[10px] font-medium text-white"
          style={{ backgroundColor: u.color, borderColor: 'var(--bg-toolbar)' }}
        >
          {u.name.slice(0, 1).toUpperCase()}
        </div>
      ))}
    </div>
  );
}
