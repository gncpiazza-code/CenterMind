import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LoginPage from '@/app/login/page';

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
  }),
}));

// Mock useAuth hook
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    login: vi.fn(),
    loading: false,
    error: null,
    isAuthenticated: false,
    user: null,
  }),
}));

describe('LoginPage Component (Smoke Test)', () => {
  it('renders correctly with logo and login form', () => {
    render(<LoginPage />);
    
    // Check for logo
    const logo = screen.getByAltText('Shelfy');
    expect(logo).toBeInTheDocument();

    // Check for "Usuario" field
    expect(screen.getByLabelText(/usuario/i)).toBeInTheDocument();
    
    // Check for "Contraseña" field
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument();

    // Check for login button
    const loginButton = screen.getByRole('button', { name: /iniciar sesión/i });
    expect(loginButton).toBeInTheDocument();
  });

  it('allows typing into username and password fields', () => {
    render(<LoginPage />);
    
    const userInput = screen.getByPlaceholderText(/tu nombre de usuario/i);
    const passInput = screen.getByPlaceholderText(/••••••••/i);

    fireEvent.change(userInput, { target: { value: 'admin' } });
    fireEvent.change(passInput, { target: { value: 'password123' } });

    expect(userInput).toHaveValue('admin');
    expect(passInput).toHaveValue('password123');
  });
});
