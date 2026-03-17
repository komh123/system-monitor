import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ContextIndicator from './ContextIndicator';

describe('ContextIndicator', () => {
  it('should display percentage', () => {
    render(<ContextIndicator percentage={45.2} />);
    expect(screen.getByText('45.2%')).toBeInTheDocument();
  });

  it('should show green color when usage < 70%', () => {
    const { container } = render(<ContextIndicator percentage={50} />);
    const badge = container.querySelector('.text-green-400');
    expect(badge).toBeInTheDocument();
  });

  it('should show yellow color when usage >= 70%', () => {
    const { container } = render(<ContextIndicator percentage={75} />);
    const badge = container.querySelector('.text-yellow-400');
    expect(badge).toBeInTheDocument();
  });

  it('should show red color when usage >= 90%', () => {
    const { container } = render(<ContextIndicator percentage={92} />);
    const badge = container.querySelector('.text-red-400');
    expect(badge).toBeInTheDocument();
  });

  it('should pulse when usage >= 95%', () => {
    const { container } = render(<ContextIndicator percentage={97} />);
    const pulsing = container.querySelector('.animate-pulse');
    expect(pulsing).toBeInTheDocument();
  });

  it('should show Compact button when >= 70% and onCompact provided', () => {
    const mockCompact = vi.fn();
    render(<ContextIndicator percentage={75} onCompact={mockCompact} />);
    expect(screen.getByText('Compact')).toBeInTheDocument();
  });

  it('should NOT show Compact button when < 70%', () => {
    const mockCompact = vi.fn();
    render(<ContextIndicator percentage={50} onCompact={mockCompact} />);
    expect(screen.queryByText('Compact')).not.toBeInTheDocument();
  });

  it('should NOT show Compact button when no onCompact handler', () => {
    render(<ContextIndicator percentage={90} />);
    expect(screen.queryByText('Compact')).not.toBeInTheDocument();
  });

  it('should call onCompact when Compact button clicked', async () => {
    const user = userEvent.setup();
    const mockCompact = vi.fn();
    render(<ContextIndicator percentage={85} onCompact={mockCompact} />);

    await user.click(screen.getByText('Compact'));
    expect(mockCompact).toHaveBeenCalledOnce();
  });

  it('should show 1M badge when total >= 1000000', () => {
    render(<ContextIndicator percentage={30} total={1000000} used={300000} />);
    expect(screen.getByText('1M')).toBeInTheDocument();
  });

  it('should NOT show 1M badge when total is 200K', () => {
    render(<ContextIndicator percentage={30} total={200000} used={60000} />);
    expect(screen.queryByText('1M')).not.toBeInTheDocument();
  });

  it('should show "Context" label when >= 95%', () => {
    render(<ContextIndicator percentage={96} />);
    expect(screen.getByText('Context')).toBeInTheDocument();
  });

  it('should have tooltip with token counts', () => {
    const { container } = render(<ContextIndicator percentage={50} used={100000} total={200000} />);
    const badge = container.querySelector('[title]');
    expect(badge.title).toContain('100,000');
    expect(badge.title).toContain('200,000');
  });
});
