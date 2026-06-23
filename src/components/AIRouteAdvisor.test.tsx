// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { AIRouteAdvisor } from './AIRouteAdvisor';
import * as aiService from '../lib/aiService';

// Mock the aiService module
vi.mock('../lib/aiService', () => ({
  optimizeRoutes: vi.fn(),
}));

describe('AIRouteAdvisor', () => {
  const mockTasks = [
    { id: '1', name: 'Task A', expiryTime: null },
    { id: '2', name: 'Task B', expiryTime: null }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders correctly when there are 2+ tasks', () => {
    render(<AIRouteAdvisor tasks={mockTasks} onApply={vi.fn()} />);
    expect(screen.getByText('AI Route Advisor')).toBeDefined();
  });

  it('does not render when there are less than 2 tasks', () => {
    const { container } = render(<AIRouteAdvisor tasks={[mockTasks[0]]} onApply={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('fetches optimization on open', async () => {
    vi.mocked(aiService.optimizeRoutes).mockResolvedValueOnce({
      suggestedOrder: ['2', '1'],
      reasoning: 'Task B is closer.'
    });

    render(<AIRouteAdvisor tasks={mockTasks} onApply={vi.fn()} />);
    
    // Click header to open
    fireEvent.click(screen.getByText('AI Route Advisor'));
    
    expect(screen.getByText('AI is analyzing your tasks...')).toBeDefined();
    
    await waitFor(() => {
      expect(screen.getByText('Task B is closer.')).toBeDefined();
    });
    
    expect(aiService.optimizeRoutes).toHaveBeenCalledTimes(1);
  });

  it('shows fallback error state when optimization fails', async () => {
    vi.mocked(aiService.optimizeRoutes).mockResolvedValueOnce(null);

    render(<AIRouteAdvisor tasks={mockTasks} onApply={vi.fn()} />);
    
    fireEvent.click(screen.getByText('AI Route Advisor'));
    
    await waitFor(() => {
      expect(screen.getByText('AI advisor is currently unavailable.')).toBeDefined();
    });
  });
});
