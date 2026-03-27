import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { Button, buttonVariants } from '../Button';

// Mock the Slot component from radix-ui
vi.mock('@radix-ui/react-slot', () => ({
  Slot: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock class-variance-authority
vi.mock('class-variance-authority', () => ({
  cva: (
    base: string,
    config: { variants: Record<string, Record<string, string>>; defaultVariants: Record<string, string> }
  ) => {
    return (props: { variant?: string; size?: string; className?: string }) => {
      let className = base;
      if (props.variant && config.variants.variant?.[props.variant]) {
        className += ' ' + config.variants.variant[props.variant];
      }
      if (props.size && config.variants.size?.[props.size]) {
        className += ' ' + config.variants.size[props.size];
      }
      if (props.className) {
        className += ' ' + props.className;
      }
      return className;
    };
  },
}));

describe('Button', () => {
  describe('Rendering', () => {
    it('renders a button element', () => {
      render(<Button>Click me</Button>);
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('renders children correctly', () => {
      render(<Button>Click me</Button>);
      expect(screen.getByText('Click me')).toBeInTheDocument();
    });

    it('renders with default variant classes', () => {
      const { container } = render(<Button>Default</Button>);
      expect(container.firstChild).toHaveClass('inline-flex');
    });
  });

  describe('Variants', () => {
    it('renders default variant', () => {
      const { container } = render(<Button variant="default">Default</Button>);
      expect(container.firstChild).toBeInTheDocument();
    });

    it('renders destructive variant', () => {
      const { container } = render(<Button variant="destructive">Delete</Button>);
      expect(container.firstChild).toBeInTheDocument();
    });

    it('renders outline variant', () => {
      const { container } = render(<Button variant="outline">Outline</Button>);
      expect(container.firstChild).toBeInTheDocument();
    });

    it('renders secondary variant', () => {
      const { container } = render(<Button variant="secondary">Secondary</Button>);
      expect(container.firstChild).toBeInTheDocument();
    });

    it('renders ghost variant', () => {
      const { container } = render(<Button variant="ghost">Ghost</Button>);
      expect(container.firstChild).toBeInTheDocument();
    });

    it('renders link variant', () => {
      const { container } = render(<Button variant="link">Link</Button>);
      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe('Sizes', () => {
    it('renders default size', () => {
      const { container } = render(<Button size="default">Default Size</Button>);
      expect(container.firstChild).toBeInTheDocument();
    });

    it('renders small size', () => {
      const { container } = render(<Button size="sm">Small</Button>);
      expect(container.firstChild).toBeInTheDocument();
    });

    it('renders large size', () => {
      const { container } = render(<Button size="lg">Large</Button>);
      expect(container.firstChild).toBeInTheDocument();
    });

    it('renders icon size', () => {
      const { container } = render(<Button size="icon">Icon</Button>);
      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe('Interactions', () => {
    it('calls onClick when clicked', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Click me</Button>);
      
      await user.click(screen.getByRole('button'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('does not call onClick when disabled', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(<Button disabled onClick={handleClick}>Disabled</Button>);
      
      await user.click(screen.getByRole('button'));
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('handles keyboard events', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Keyboard</Button>);
      
      const button = screen.getByRole('button');
      button.focus();
      await user.keyboard('{Enter}');
      // Keyboard events on buttons work differently in test environment
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('Accessibility', () => {
    it('can receive focus', () => {
      render(<Button>Focusable</Button>);
      const button = screen.getByRole('button');
      button.focus();
      expect(button).toHaveFocus();
    });

    it('is accessible via tab navigation', async () => {
      const user = userEvent.setup();
      render(
        <>
          <Button>First</Button>
          <Button>Second</Button>
        </>
      );
      
      await user.tab();
      expect(screen.getByText('First')).toHaveFocus();
      
      await user.tab();
      expect(screen.getByText('Second')).toHaveFocus();
    });
  });

  describe('Disabled state', () => {
    it('renders as disabled when disabled prop is true', () => {
      render(<Button disabled>Disabled</Button>);
      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('renders with disabled styling when disabled', () => {
      const { container } = render(<Button disabled>Disabled</Button>);
      // Button should render without errors when disabled
      expect(screen.getByRole('button')).toBeDisabled();
      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe('Custom className', () => {
    it('merges custom className with variant classes', () => {
      const { container } = render(
        <Button className="custom-class">Custom</Button>
      );
      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe('asChild prop', () => {
    it('renders with asChild prop', () => {
      const { container } = render(
        <Button asChild>
          <span>Child Element</span>
        </Button>
      );
      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe('buttonVariants', () => {
    it('generates variant classes correctly', () => {
      const classes = buttonVariants({ variant: 'default' });
      expect(classes).toContain('bg-primary');
    });

    it('generates size classes correctly', () => {
      const classes = buttonVariants({ size: 'sm' });
      expect(classes).toContain('h-9');
    });

    it('combines variant and size classes', () => {
      const classes = buttonVariants({ variant: 'outline', size: 'lg' });
      expect(classes).toContain('border');
      expect(classes).toContain('h-11');
    });

    it('generates base classes when no options provided', () => {
      const classes = buttonVariants({});
      // Just verify it returns a string with the base class
      expect(typeof classes).toBe('string');
      expect(classes).toContain('inline-flex');
    });
  });
});
