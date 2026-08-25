import { useState, FormEvent } from 'react';
import { supabase } from './supabaseClient'; // adjust path if needed
 
type StatusType = 'idle' | 'loading' | 'error' | 'success';
 
interface Status {
  type: StatusType;
  message: string;
}
 
// This component no longer listens for PASSWORD_RECOVERY itself --
// App.tsx already caught that event and only renders this component
// when it's true. That means by the time this shows up on screen,
// we already know we're in a valid recovery flow.
export default function ResetPassword({ onDone }: { onDone: () => void }) {
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [status, setStatus] = useState<Status>({ type: 'idle', message: '' });
 
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
 
    if (newPassword !== confirmPassword) {
      setStatus({ type: 'error', message: "Passwords don't match." });
      return;
    }
 
    if (newPassword.length < 6) {
      setStatus({ type: 'error', message: 'Password must be at least 6 characters.' });
      return;
    }
 
    setStatus({ type: 'loading', message: 'Updating password...' });
 
    // The temporary session from PASSWORD_RECOVERY is what makes this call
    // work without needing to pass a user ID -- Supabase already knows
    // who this token belongs to.
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
 
    if (error) {
      setStatus({ type: 'error', message: error.message });
    } else {
      setStatus({ type: 'success', message: 'Password updated! Redirecting to login...' });
      // Give the user a moment to see the success message, then hand
      // control back to App.tsx so it falls through to the login screen.
      setTimeout(() => {
        onDone();
      }, 1500);
    }
  };
 
  return (
    <div style={{ maxWidth: 400, margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h2>Set a new password</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="newPassword">New password</label> <br />
          <input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
        </div>
        <div style={{ marginTop: 10 }}>
          <label htmlFor="confirmPassword">Confirm password</label> <br />
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit" disabled={status.type === 'loading'} style={{ marginTop: 15 }}>
          Update password
        </button>
      </form>
      {status.message && (
        <p style={{ color: status.type === 'error' ? 'red' : 'green' }}>
          {status.message}
        </p>
      )}
    </div>
  );
}