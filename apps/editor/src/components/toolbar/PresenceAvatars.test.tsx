import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PresenceAvatars } from './PresenceAvatars.js';
import { useAuthStore } from '../../store/auth.js';
import { usePresenceStore } from '../../store/presence.js';
import { presenceColorForUserId, presenceLabelColor } from '../../lib/presence-color.js';

afterEach(() => {
  useAuthStore.setState({ user: null, accessToken: null, status: 'idle' });
  usePresenceStore.setState({ remoteStates: {} });
});

const self = { id: 'user-self', email: 'self@example.com', name: 'Selina' };

describe('PresenceAvatars', () => {
  it('renders nothing when signed out with no remote peers', () => {
    render(<PresenceAvatars />);
    expect(screen.queryByTestId('presence-avatars')).toBeNull();
  });

  it('renders the signed-in user own avatar when solo', () => {
    useAuthStore.setState({ user: self, status: 'authenticated' });
    render(<PresenceAvatars />);

    const avatar = screen.getByTitle('Selina');
    expect(avatar.textContent).toBe('S');
    expect(avatar.style.backgroundColor).toBeTruthy();
  });

  it('renders own avatar first, then remote peers', () => {
    useAuthStore.setState({ user: self, status: 'authenticated' });
    usePresenceStore.setState({
      remoteStates: {
        'user-remote': { userId: 'user-remote', name: 'Remy', color: '#eab308' },
      },
    });
    render(<PresenceAvatars />);

    const container = screen.getByTestId('presence-avatars');
    const titles = Array.from(container.children).map((el) => el.getAttribute('title'));
    expect(titles).toEqual(['Selina', 'Remy']);
  });

  it('does not duplicate the signed-in user when present in remote states', () => {
    useAuthStore.setState({ user: self, status: 'authenticated' });
    usePresenceStore.setState({
      remoteStates: {
        [self.id]: { userId: self.id, name: 'Selina', color: '#eab308' },
      },
    });
    render(<PresenceAvatars />);

    expect(screen.getAllByTitle('Selina')).toHaveLength(1);
  });

  it('uses a readable label color instead of hardcoded white', () => {
    usePresenceStore.setState({
      remoteStates: {
        'user-yellow': { userId: 'user-yellow', name: 'Yara', color: '#eab308' },
      },
    });
    render(<PresenceAvatars />);

    const avatar = screen.getByTitle('Yara');
    // happy-dom may normalize hex values; compare via a probe element.
    const probe = document.createElement('div');
    probe.style.color = presenceLabelColor('#eab308');
    expect(avatar.style.color).toBe(probe.style.color);
    expect(presenceLabelColor('#eab308')).toBe('#18181b');
  });

  it('derives own avatar color deterministically from the user id', () => {
    useAuthStore.setState({ user: self, status: 'authenticated' });
    render(<PresenceAvatars />);

    const avatar = screen.getByTitle('Selina');
    // happy-dom normalizes hex to rgb(); compare via a probe element.
    const probe = document.createElement('div');
    probe.style.backgroundColor = presenceColorForUserId(self.id);
    expect(avatar.style.backgroundColor).toBe(probe.style.backgroundColor);
  });
});
