import React, {useState} from 'react';
import {supabase} from './supabaseClient';

const Auth = ({onLogin}: {onLogin: () => void}) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const [isForgotPassword, setIsForgotPassword] = useState(false);

    const [resetStatus, setResetStatus] = useState('');

    const handleSubmit = async () => {
        setErrorMsg('');

        const{error} = isSignUp
            ? await supabase.auth.signUp({email, password})
            : await supabase.auth.signInWithPassword({email, password});

        if(error){
            setErrorMsg(error.message);
        } else {
            onLogin();
        }
    };

    const handlePasswordReset = async () => {
        setErrorMsg('');
        setResetStatus('');

        if(!email){
            setErrorMsg("Enter your email above first.");
            return;
        }
        const {error}  = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: 'http://localhost:3000/main_window/index.html',
        });

        if(error){
            setErrorMsg(error.message);
        } else {
            setResetStatus('If an account exists for that email, a reset link has been sent.');
        }
    };

    //separate render branch for the forgot password screen
    if (isForgotPassword) {
        return (
            <div style={{ padding: 40, fontFamily: 'sans-serif' }}>
                <h2>Reset your password</h2>
                <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                /> <br />
                <button onClick={handlePasswordReset}>Send reset link</button>
                <p>
                    <button onClick={() => {
                        setIsForgotPassword(false);
                        setErrorMsg('');
                        setResetStatus('');
                    }}>
                        Back to log in
                    </button>
                </p>
                {resetStatus && <p style={{color: 'green'}}>{resetStatus}</p>}
                {errorMsg && <p style={{color: 'red'}}>{errorMsg}</p>}
            </div>
        );
    }
    

    return (
        <div style={{ padding: 40, fontFamily: 'sans-serif '}}>
            <h2>{isSignUp ? 'Sign Up' : 'Log In'}</h2>
            <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
            /> <br />
            <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
            /> <br />
            <button onClick={handleSubmit}>{isSignUp ? 'Sign Up' : 'Log In'} </button>
            <p>
                <button onClick={() => setIsSignUp(!isSignUp)}>
                    {isSignUp ? 'Already have an account? Log in': "Don't have an account? Sign up"}
                </button>
            </p>
            {!isSignUp && (
                <p>
                    <button onClick={() => setIsForgotPassword(true)}>
                        Forgot password?
                    </button>
                </p>
            )}
            {errorMsg && <p style={{color: 'red'}}>{errorMsg}</p>}
        </div>
    );
};

export default Auth;