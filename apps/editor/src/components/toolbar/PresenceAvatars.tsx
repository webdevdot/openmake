import { usePresenceStore } from '../../store/presence.js';
import { useAuthStore } from '../../store/auth.js';
import { presenceColorForUserId, presenceLabelColor } from '../../lib/presence-color.js';

export function PresenceAvatars() {
  const remoteStates = usePresenceStore((s) => s.remoteStates);
  const user = useAuthStore((s) => s.user);

  const self = user
    ? { userId: user.id, name: user.name, color: presenceColorForUserId(user.id) }
    : null;
  const remoteUsers = Object.values(remoteStates).filter((u) => u.userId !== self?.userId);
  const avatars = self ? [self, ...remoteUsers] : remoteUsers;
  if (avatars.length === 0) return null;

  return (
    <div className="flex -space-x-2" data-testid="presence-avatars">
      {avatars.map((u) => (
        <div
          key={u.userId}
          title={u.name}
          className="flex h-6 w-6 items-center justify-center rounded-full border-2 text-[10px] font-medium"
          style={{
            backgroundColor: u.color,
            borderColor: 'var(--bg-toolbar)',
            color: presenceLabelColor(u.color),
          }}
        >
          {u.name.slice(0, 1).toUpperCase()}
        </div>
      ))}
    </div>
  );
}
