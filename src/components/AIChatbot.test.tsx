// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { AIChatbot } from './AIChatbot';
import * as aiService from '../lib/aiService';

vi.mock('../lib/aiService', () => ({
  askAssistant: vi.fn(),
  checkLLMHealth: vi.fn(),
}));

describe('AIChatbot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(aiService.checkLLMHealth).mockResolvedValue(true);
    
    // Mock scrollIntoView which jsdom lacks
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders trigger button initially', () => {
    render(<AIChatbot />);
    expect(screen.getByLabelText('Open AI Assistant')).toBeDefined();
  });

  it('opens chat window on click', async () => {
    render(<AIChatbot />);
    fireEvent.click(screen.getByLabelText('Open AI Assistant'));
    expect(screen.getByText('AI Assistant')).toBeDefined();
    expect(screen.getByText('Welcome to Zero Food Waste AI')).toBeDefined();
  });

  it('handles sending messages and graceful degradation on failure', async () => {
    vi.mocked(aiService.askAssistant).mockResolvedValueOnce(null);
    
    render(<AIChatbot />);
    fireEvent.click(screen.getByLabelText('Open AI Assistant'));
    
    const input = screen.getByPlaceholderText('Ask me anything...');
    fireEvent.change(input, { target: { value: 'Hello' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    
    expect(screen.getByText('Hello')).toBeDefined();
    
    await waitFor(() => {
      expect(screen.getByText("I'm having trouble connecting right now. Please try again in a moment.")).toBeDefined();
    });
  });

  it('handles successful message response', async () => {
    vi.mocked(aiService.askAssistant).mockResolvedValueOnce("How can I help you today?");
    
    render(<AIChatbot />);
    fireEvent.click(screen.getByLabelText('Open AI Assistant'));
    
    const input = screen.getByPlaceholderText('Ask me anything...');
    fireEvent.change(input, { target: { value: 'Hello' } });
    fireEvent.click(screen.getByLabelText('Send message'));
    
    await waitFor(() => {
      expect(screen.getByText("How can I help you today?")).toBeDefined();
    });
  });
});
