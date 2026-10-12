import { useState } from 'react';
import Auth from './Auth';
import Projects from './components/projects/Projects';
import ResetPassword from './ResetPassword';
import Studio from './components/Studio';
import { useAuthSession } from './hooks/useAuthSession';
import './App.css';
import './GlobalStyles.css';

const App = () => {
    const { session, username, isPasswordRecovery, finishPasswordRecovery } = useAuthSession();
    const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

    if (isPasswordRecovery) {
        return <ResetPassword onDone={finishPasswordRecovery} />;
    }

    if (!session) {
        return <Auth onLogin={() => {/* session updates via onAuthStateChange */}} />;
    }

    if (!currentProjectId) {
        return (
            <div>
                {username && <p className="welcome-message">Welcome, {username}!</p>}
                <Projects onSelectProject={setCurrentProjectId} />
            </div>
        );
    }

    return <Studio projectId={currentProjectId} onBack={() => setCurrentProjectId(null)} />;
};

export default App;