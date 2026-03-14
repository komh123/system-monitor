import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MessageInput from './MessageInput';

// Mock fetch
global.fetch = vi.fn();

describe('MessageInput - Command Autocomplete', () => {
  const mockOnSend = vi.fn();
  const mockOnStop = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        sessionCommands: [
          { id: 'compact', name: '/compact', description: 'Compress context' },
          { id: 'cost', name: '/cost', description: 'Show API costs' },
          { id: 'context', name: '/context', description: 'Show token usage' },
          { id: 'clear', name: '/clear', description: 'Clear conversation' }
        ],
        skills: [],
        agents: []
      })
    });
  });

  it('should show command autocomplete when user types "/"', async () => {
    const user = userEvent.setup();
    render(<MessageInput onSend={mockOnSend} disabled={false} onStop={mockOnStop} isStreaming={false} />);

    const textarea = screen.getByPlaceholderText('Type a message...');
    await user.type(textarea, '/');

    // Should show autocomplete dropdown
    await waitFor(() => {
      expect(screen.getByText('/compact')).toBeInTheDocument();
      expect(screen.getByText('/cost')).toBeInTheDocument();
      expect(screen.getByText('/context')).toBeInTheDocument();
      expect(screen.getByText('/clear')).toBeInTheDocument();
    });
  });

  it('should filter commands based on typed text', async () => {
    const user = userEvent.setup();
    render(<MessageInput onSend={mockOnSend} disabled={false} onStop={mockOnStop} isStreaming={false} />);

    const textarea = screen.getByPlaceholderText('Type a message...');
    await user.type(textarea, '/co');

    // Should only show commands starting with "/co"
    await waitFor(() => {
      expect(screen.getByText('/compact')).toBeInTheDocument();
      expect(screen.getByText('/cost')).toBeInTheDocument();
      expect(screen.getByText('/context')).toBeInTheDocument();
      expect(screen.queryByText('/clear')).not.toBeInTheDocument();
    });
  });

  it('should insert selected command when clicked', async () => {
    const user = userEvent.setup();
    render(<MessageInput onSend={mockOnSend} disabled={false} onStop={mockOnStop} isStreaming={false} />);

    const textarea = screen.getByPlaceholderText('Type a message...');
    await user.type(textarea, '/');

    await waitFor(() => {
      expect(screen.getByText('/compact')).toBeInTheDocument();
    });

    const compactOption = screen.getByText('/compact');
    await user.click(compactOption);

    // Textarea should now contain the full command
    expect(textarea.value).toBe('/compact');

    // Autocomplete should be hidden
    await waitFor(() => {
      expect(screen.queryByText('/cost')).not.toBeInTheDocument();
    });
  });

  it('should hide autocomplete when typing non-slash text', async () => {
    const user = userEvent.setup();
    render(<MessageInput onSend={mockOnSend} disabled={false} onStop={mockOnStop} isStreaming={false} />);

    const textarea = screen.getByPlaceholderText('Type a message...');
    await user.type(textarea, '/co');

    await waitFor(() => {
      expect(screen.getByText('/compact')).toBeInTheDocument();
    });

    // Add space (commands must be at start of line)
    await user.type(textarea, ' hello');

    await waitFor(() => {
      expect(screen.queryByText('/compact')).not.toBeInTheDocument();
    });
  });

  it('should send slash command when user presses Enter', async () => {
    const user = userEvent.setup();
    render(<MessageInput onSend={mockOnSend} disabled={false} onStop={mockOnStop} isStreaming={false} />);

    const textarea = screen.getByPlaceholderText('Type a message...');
    await user.type(textarea, '/compact{Enter}');

    expect(mockOnSend).toHaveBeenCalledWith('/compact');
  });

  it('should have mobile-friendly touch targets (min 44px height)', async () => {
    const user = userEvent.setup();
    render(<MessageInput onSend={mockOnSend} disabled={false} onStop={mockOnStop} isStreaming={false} />);

    const textarea = screen.getByPlaceholderText('Type a message...');
    await user.type(textarea, '/');

    await waitFor(() => {
      const commandOption = screen.getByText('/compact').closest('button, div[role="button"]');
      expect(commandOption).toBeInTheDocument();

      // Get computed style
      const styles = window.getComputedStyle(commandOption);
      const minHeight = parseInt(styles.minHeight);

      // Should be at least 44px for mobile touch targets
      expect(minHeight).toBeGreaterThanOrEqual(44);
    });
  });
});
