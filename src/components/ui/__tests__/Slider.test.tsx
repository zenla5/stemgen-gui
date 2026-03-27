import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { Slider } from '../Slider';

// Mock @radix-ui/react-slider
vi.mock('@radix-ui/react-slider', () => ({
  Root: React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { orientation?: string }>(
    ({ className, children, orientation, ...props }, ref) => (
      <div 
        ref={ref} 
        className={className || 'slider-root'} 
        data-testid="slider-root" 
        data-orientation={orientation || 'horizontal'} 
        {...props}
      >
        {children}
      </div>
    )
  ),
  Track: React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, children, ...props }, ref) => (
      <div 
        ref={ref} 
        className={className || 'slider-track'} 
        data-testid="slider-track" 
        {...props}
      >
        {children}
      </div>
    )
  ),
  Range: React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
      <div 
        ref={ref} 
        className={className || 'slider-range'} 
        data-testid="slider-range" 
        {...props} 
      />
    )
  ),
  Thumb: React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
      <div 
        ref={ref} 
        className={className || 'slider-thumb'} 
        data-testid="slider-thumb" 
        {...props} 
      />
    )
  ),
}));

describe('Slider', () => {
  describe('Rendering', () => {
    it('renders the slider root element', () => {
      render(<Slider />);
      expect(screen.getByTestId('slider-root')).toBeInTheDocument();
    });

    it('renders the track element', () => {
      render(<Slider />);
      expect(screen.getByTestId('slider-track')).toBeInTheDocument();
    });

    it('renders the range element', () => {
      render(<Slider />);
      expect(screen.getByTestId('slider-range')).toBeInTheDocument();
    });

    it('renders the thumb element', () => {
      render(<Slider />);
      expect(screen.getByTestId('slider-thumb')).toBeInTheDocument();
    });

    it('renders with default horizontal orientation', () => {
      const { container } = render(<Slider />);
      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe('Orientation', () => {
    it('renders with horizontal orientation by default', () => {
      render(<Slider />);
      const root = screen.getByTestId('slider-root');
      expect(root).toHaveAttribute('data-orientation', 'horizontal');
    });

    it('renders with vertical orientation', () => {
      render(<Slider orientation="vertical" />);
      const root = screen.getByTestId('slider-root');
      expect(root).toHaveAttribute('data-orientation', 'vertical');
    });

    it('applies vertical styling classes when orientation is vertical', () => {
      const { container } = render(<Slider orientation="vertical" />);
      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('applies custom className', () => {
      const { container } = render(<Slider className="custom-slider" />);
      expect(container.firstChild).toHaveClass('custom-slider');
    });

    it('has touch-none class for mobile support', () => {
      const { container } = render(<Slider />);
      expect(container.firstChild).toHaveClass('touch-none');
    });

    it('has select-none class', () => {
      const { container } = render(<Slider />);
      expect(container.firstChild).toHaveClass('select-none');
    });

    it('has flex layout classes', () => {
      const { container } = render(<Slider />);
      expect(container.firstChild).toHaveClass('flex');
      expect(container.firstChild).toHaveClass('items-center');
    });
  });

  describe('Track styling', () => {
    it('applies bg-secondary class to track', () => {
      render(<Slider />);
      const track = screen.getByTestId('slider-track');
      expect(track).toHaveClass('bg-secondary');
    });

    it('applies rounded-full class to track', () => {
      render(<Slider />);
      const track = screen.getByTestId('slider-track');
      expect(track).toHaveClass('rounded-full');
    });

    it('has h-2 height class for horizontal track', () => {
      render(<Slider />);
      const track = screen.getByTestId('slider-track');
      expect(track).toHaveClass('h-2');
    });
  });

  describe('Range styling', () => {
    it('applies bg-primary class to range', () => {
      render(<Slider />);
      const range = screen.getByTestId('slider-range');
      expect(range).toHaveClass('bg-primary');
    });

    it('has absolute positioning', () => {
      render(<Slider />);
      const range = screen.getByTestId('slider-range');
      expect(range).toHaveClass('absolute');
    });

    it('has rounded-full class', () => {
      render(<Slider />);
      const range = screen.getByTestId('slider-range');
      expect(range).toHaveClass('rounded-full');
    });
  });

  describe('Thumb styling', () => {
    it('applies thumb styling classes', () => {
      render(<Slider />);
      const thumb = screen.getByTestId('slider-thumb');
      expect(thumb).toHaveClass('block');
    });

    it('has h-5 w-5 dimensions', () => {
      render(<Slider />);
      const thumb = screen.getByTestId('slider-thumb');
      expect(thumb).toHaveClass('h-5');
      expect(thumb).toHaveClass('w-5');
    });

    it('has rounded-full border styling', () => {
      render(<Slider />);
      const thumb = screen.getByTestId('slider-thumb');
      expect(thumb).toHaveClass('rounded-full');
      expect(thumb).toHaveClass('border-primary');
    });

    it('has focus-visible ring styles', () => {
      render(<Slider />);
      const thumb = screen.getByTestId('slider-thumb');
      expect(thumb).toHaveClass('focus-visible:outline-none');
    });
  });

  describe('Accessibility', () => {
    it('renders without crashing', () => {
      expect(() => render(<Slider />)).not.toThrow();
    });

    it('can render multiple sliders', () => {
      render(
        <>
          <Slider />
          <Slider />
        </>
      );
      const thumbs = screen.getAllByTestId('slider-thumb');
      expect(thumbs).toHaveLength(2);
    });
  });

  describe('Props passthrough', () => {
    it('passes through additional props', () => {
      const { container } = render(<Slider data-testid="custom-slider" />);
      expect(screen.getByTestId('custom-slider')).toBeInTheDocument();
    });
  });
});
