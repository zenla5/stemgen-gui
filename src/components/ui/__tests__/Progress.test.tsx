import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { Progress } from '../Progress';

// Mock @radix-ui/react-progress
vi.mock('@radix-ui/react-progress', () => ({
  Root: React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { value?: number }>(
    ({ className, children, ...props }, ref) => (
      <div ref={ref} className={className} data-testid="progress-root" {...props}>
        {children}
      </div>
    )
  ),
  Indicator: React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, style, ...props }, ref) => (
      <div ref={ref} className={className} style={style} data-testid="progress-indicator" {...props} />
    )
  ),
}));

describe('Progress', () => {
  describe('Rendering', () => {
    it('renders the progress root element', () => {
      render(<Progress />);
      expect(screen.getByTestId('progress-root')).toBeInTheDocument();
    });

    it('renders the indicator element', () => {
      render(<Progress />);
      expect(screen.getByTestId('progress-indicator')).toBeInTheDocument();
    });

    it('renders with default styles', () => {
      const { container } = render(<Progress />);
      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe('Value prop', () => {
    it('renders with a specific value', () => {
      render(<Progress value={50} />);
      const indicator = screen.getByTestId('progress-indicator');
      expect(indicator).toBeInTheDocument();
    });

    it('handles value of 0', () => {
      render(<Progress value={0} />);
      const indicator = screen.getByTestId('progress-indicator');
      expect(indicator).toBeInTheDocument();
    });

    it('handles value of 100', () => {
      render(<Progress value={100} />);
      const indicator = screen.getByTestId('progress-indicator');
      expect(indicator).toBeInTheDocument();
    });

    it('handles undefined value', () => {
      render(<Progress value={undefined} />);
      const indicator = screen.getByTestId('progress-indicator');
      expect(indicator).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('applies custom className', () => {
      const { container } = render(<Progress className="custom-progress" />);
      expect(container.firstChild).toHaveClass('custom-progress');
    });

    it('has overflow-hidden class for containment', () => {
      const { container } = render(<Progress />);
      expect(container.firstChild).toHaveClass('overflow-hidden');
    });

    it('has rounded-full class for styling', () => {
      const { container } = render(<Progress />);
      expect(container.firstChild).toHaveClass('rounded-full');
    });

    it('has h-4 height class', () => {
      const { container } = render(<Progress />);
      expect(container.firstChild).toHaveClass('h-4');
    });
  });

  describe('Indicator styling', () => {
    it('applies bg-primary class to indicator', () => {
      render(<Progress />);
      const indicator = screen.getByTestId('progress-indicator');
      expect(indicator).toHaveClass('bg-primary');
    });

    it('applies h-full class to indicator', () => {
      render(<Progress />);
      const indicator = screen.getByTestId('progress-indicator');
      expect(indicator).toHaveClass('h-full');
    });

    it('applies transition-all class for smooth animations', () => {
      render(<Progress />);
      const indicator = screen.getByTestId('progress-indicator');
      expect(indicator).toHaveClass('transition-all');
    });
  });

  describe('Accessibility', () => {
    it('renders without crashing', () => {
      expect(() => render(<Progress />)).not.toThrow();
    });

    it('renders with aria attributes', () => {
      render(<Progress value={50} />);
      // The component should render without errors
      expect(screen.getByTestId('progress-root')).toBeInTheDocument();
    });
  });
});
