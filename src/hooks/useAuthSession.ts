import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export function useAuthSession() {
    const [session, setSession] = useState<any>(null);
    const [username, setUsername] = useState<string | null>(null);
    const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

    // Detect password-recovery links
    useEffect(() => {
        if (
            window.location.pathname === '/reset-password' ||
            window.location.hash.includes('type=recovery') ||
            window.location.hash.includes('reset-password')
        ) {
            setIsPasswordRecovery(true);
        }
    }, []);

    // Session + auth events
    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => setSession(data.session));

        const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
            if (event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true);
            setSession(newSession);
        });
        return () => listener.subscription.unsubscribe();
    }, []);

    // Profile username
    useEffect(() => {
        if (!session) {
            setUsername(null);
            return;
        }
        supabase
            .from('profiles')
            .select('username')
            .eq('id', session.user.id)
            .single()
            .then(({ data, error }) => {
                if (!error && data) setUsername(data.username);
            });
    }, [session]);

    const finishPasswordRecovery = () => {
        setIsPasswordRecovery(false);
        window.history.replaceState({}, document.title, '/');
        window.location.hash = '';
    };

    return { session, username, isPasswordRecovery, finishPasswordRecovery };
}