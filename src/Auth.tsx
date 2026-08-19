import React, {useState} from 'react';
import {supabase} from './supabaseClient';

const Auth = ({onLogin}: {onLogin: () => void}) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

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
            {errorMsg && <p style={{color: 'red'}}>{errorMsg}</p>}
        </div>
    );
};

export default Auth;