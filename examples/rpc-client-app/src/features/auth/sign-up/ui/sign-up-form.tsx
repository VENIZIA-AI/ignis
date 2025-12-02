import { useActionState } from 'react';
import { Button } from 'antd';
import { useSignUp } from '../api';
import type { FormState } from '../model';

export function SignUpForm() {
  const signUpMutation = useSignUp();

  const signUpAction = async (
    _prevState: FormState,
    formData: FormData
  ): Promise<FormState> => {
    const username = formData.get('username') as string;
    const credential = formData.get('credential') as string;

    try {
      await signUpMutation.mutateAsync({
        body: { username, credential },
      });
      return { status: 'success', message: 'Sign up successful!' };
    } catch (error: unknown) {
      return {
        status: 'error',
        message: (error as string) || 'Sign up failed. Please try again.',
      };
    }
  };

  const [state, formAction, isPending] = useActionState(signUpAction, {
    status: 'idle',
  });

  return (
    <div
      style={{
        maxWidth: '400px',
        margin: '2rem auto',
        padding: '2rem',
        border: '1px solid #646cff',
        borderRadius: '8px',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
      }}
    >
      <h2 style={{ marginTop: 0, marginBottom: '1.5rem', textAlign: 'center' }}>
        Sign Up
      </h2>

      <form
        action={formAction}
        style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label htmlFor="username" style={{ fontSize: '0.9rem', fontWeight: '500' }}>
            Username
          </label>
          <input
            id="username"
            name="username"
            type="text"
            required
            placeholder="Enter username"
            disabled={isPending}
            style={{
              padding: '0.75rem',
              borderRadius: '4px',
              border: '1px solid #646cff',
              backgroundColor: 'transparent',
              color: 'inherit',
              fontSize: '1rem',
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label htmlFor="credential" style={{ fontSize: '0.9rem', fontWeight: '500' }}>
            Password
          </label>
          <input
            id="credential"
            name="credential"
            type="password"
            required
            placeholder="Enter password"
            disabled={isPending}
            style={{
              padding: '0.75rem',
              borderRadius: '4px',
              border: '1px solid #646cff',
              backgroundColor: 'transparent',
              color: 'inherit',
              fontSize: '1rem',
            }}
          />
        </div>

        <Button type="primary" disabled={isPending}>
          {isPending ? 'Signing up...' : 'Sign Up'}
        </Button>

        {state.status === 'error' && state.message && (
          <p style={{ color: '#ff6b6b', margin: 0, fontSize: '0.9rem' }}>
            Error: {state.message}
          </p>
        )}

        {state.status === 'success' && state.message && (
          <p style={{ color: '#51cf66', margin: 0, fontSize: '0.9rem' }}>
            {state.message} ✓
          </p>
        )}
      </form>
    </div>
  );
}
