import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CommandPalette from './CommandPalette';

const MOCK_COMMANDS = [
  { id: 'compact', name: '/compact', description: 'Compress context', category: 'session' },
  { id: 'cost', name: '/cost', description: 'Show API costs', category: 'session' },
  { id: 'context', name: '/context', description: 'Show token usage', category: 'session' },
];

const MOCK_SKILLS = [
  { id: 'superpower:brainstorm', name: '/superpower:brainstorm', description: 'Explore requirements', category: 'skill' },
  { id: 'superpower:tdd', name: '/superpower:tdd', description: 'Test-Driven Development', category: 'skill' },
];

const MOCK_MCP = [
  { name: 'pencil', description: 'Design tool', category: 'mcp' },
];

const ALL_COMMANDS = [...MOCK_COMMANDS, ...MOCK_SKILLS];

describe('CommandPalette', () => {
  const mockOnClose = vi.fn();
  const mockOnSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset body styles (scroll lock cleanup)
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    document.body.style.overflow = '';
  });

  afterEach(() => {
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    document.body.style.overflow = '';
  });

  it('should render nothing when not open', () => {
    const { container } = render(
      <CommandPalette isOpen={false} onClose={mockOnClose} onSelect={mockOnSelect} commands={ALL_COMMANDS} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('should render palette when open', () => {
    render(
      <CommandPalette isOpen={true} onClose={mockOnClose} onSelect={mockOnSelect} commands={ALL_COMMANDS} />
    );
    expect(screen.getByPlaceholderText(/Search commands/)).toBeInTheDocument();
  });

  it('should show all commands grouped by category', () => {
    render(
      <CommandPalette isOpen={true} onClose={mockOnClose} onSelect={mockOnSelect} commands={ALL_COMMANDS} />
    );

    // Session commands
    expect(screen.getByText('/compact')).toBeInTheDocument();
    expect(screen.getByText('/cost')).toBeInTheDocument();

    // Skills
    expect(screen.getByText('/superpower:brainstorm')).toBeInTheDocument();
    expect(screen.getByText('/superpower:tdd')).toBeInTheDocument();
  });

  it('should filter items based on search query', async () => {
    const user = userEvent.setup();
    render(
      <CommandPalette isOpen={true} onClose={mockOnClose} onSelect={mockOnSelect} commands={ALL_COMMANDS} />
    );

    const input = screen.getByPlaceholderText(/Search commands/);
    await user.type(input, 'tdd');

    expect(screen.getByText('/superpower:tdd')).toBeInTheDocument();
    expect(screen.queryByText('/compact')).not.toBeInTheDocument();
    expect(screen.queryByText('/superpower:brainstorm')).not.toBeInTheDocument();
  });

  it('should close when non-skill item is selected', async () => {
    const user = userEvent.setup();
    render(
      <CommandPalette isOpen={true} onClose={mockOnClose} onSelect={mockOnSelect} commands={ALL_COMMANDS} />
    );

    const compactButton = screen.getByText('/compact').closest('button');
    await user.click(compactButton);

    expect(mockOnSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'compact' }));
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should close on ESC key', async () => {
    const user = userEvent.setup();
    render(
      <CommandPalette isOpen={true} onClose={mockOnClose} onSelect={mockOnSelect} commands={ALL_COMMANDS} />
    );

    const input = screen.getByPlaceholderText(/Search commands/);
    await user.type(input, '{Escape}');

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should close when clicking backdrop', async () => {
    const user = userEvent.setup();
    render(
      <CommandPalette isOpen={true} onClose={mockOnClose} onSelect={mockOnSelect} commands={ALL_COMMANDS} />
    );

    // Click the backdrop (the fixed overlay div)
    const backdrop = screen.getByPlaceholderText(/Search commands/).closest('.fixed');
    await user.click(backdrop);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should have a visible close button on mobile (not hidden)', () => {
    render(
      <CommandPalette isOpen={true} onClose={mockOnClose} onSelect={mockOnSelect} commands={ALL_COMMANDS} />
    );

    // Should have an accessible close button (aria-label)
    const closeBtn = screen.getByLabelText('Close command palette');
    expect(closeBtn).toBeInTheDocument();
  });

  it('should lock body scroll when open', () => {
    render(
      <CommandPalette isOpen={true} onClose={mockOnClose} onSelect={mockOnSelect} commands={ALL_COMMANDS} />
    );

    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body.style.position).toBe('fixed');
  });

  it('should unlock body scroll when closed', () => {
    const { rerender } = render(
      <CommandPalette isOpen={true} onClose={mockOnClose} onSelect={mockOnSelect} commands={ALL_COMMANDS} />
    );

    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <CommandPalette isOpen={false} onClose={mockOnClose} onSelect={mockOnSelect} commands={ALL_COMMANDS} />
    );

    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('should navigate with keyboard (ArrowDown/ArrowUp)', async () => {
    const user = userEvent.setup();
    render(
      <CommandPalette isOpen={true} onClose={mockOnClose} onSelect={mockOnSelect} commands={ALL_COMMANDS} />
    );

    const input = screen.getByPlaceholderText(/Search commands/);

    // Arrow down to move selection
    await user.type(input, '{ArrowDown}');
    await user.type(input, '{ArrowDown}');

    // Press Enter to select
    await user.type(input, '{Enter}');

    // Should have selected the 3rd item (index 2 = 'context')
    expect(mockOnSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'context' }));
  });

  it('should merge MCP tools into the list', () => {
    render(
      <CommandPalette
        isOpen={true}
        onClose={mockOnClose}
        onSelect={mockOnSelect}
        commands={ALL_COMMANDS}
        mcpTools={MOCK_MCP}
      />
    );

    expect(screen.getByText('pencil')).toBeInTheDocument();
  });

  it('should show "No matching commands found" for empty results', async () => {
    const user = userEvent.setup();
    render(
      <CommandPalette isOpen={true} onClose={mockOnClose} onSelect={mockOnSelect} commands={ALL_COMMANDS} />
    );

    const input = screen.getByPlaceholderText(/Search commands/);
    await user.type(input, 'xyznonexistent');

    expect(screen.getByText(/No matching commands found/)).toBeInTheDocument();
  });

  it('should have touch-friendly item height (min 48px)', () => {
    render(
      <CommandPalette isOpen={true} onClose={mockOnClose} onSelect={mockOnSelect} commands={ALL_COMMANDS} />
    );

    const button = screen.getByText('/compact').closest('button');
    expect(button.style.minHeight).toBe('48px');
  });

  it('should reset query and selection when reopened', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <CommandPalette isOpen={true} onClose={mockOnClose} onSelect={mockOnSelect} commands={ALL_COMMANDS} />
    );

    const input = screen.getByPlaceholderText(/Search commands/);
    await user.type(input, 'tdd');

    // Close and reopen
    rerender(
      <CommandPalette isOpen={false} onClose={mockOnClose} onSelect={mockOnSelect} commands={ALL_COMMANDS} />
    );
    rerender(
      <CommandPalette isOpen={true} onClose={mockOnClose} onSelect={mockOnSelect} commands={ALL_COMMANDS} />
    );

    // Query should be reset
    const newInput = screen.getByPlaceholderText(/Search commands/);
    expect(newInput.value).toBe('');

    // All items should be visible again
    expect(screen.getByText('/compact')).toBeInTheDocument();
    expect(screen.getByText('/superpower:tdd')).toBeInTheDocument();
  });

  it('should show footer hints', () => {
    render(
      <CommandPalette isOpen={true} onClose={mockOnClose} onSelect={mockOnSelect} commands={ALL_COMMANDS} />
    );

    expect(screen.getByText('Close')).toBeInTheDocument();
  });
});
